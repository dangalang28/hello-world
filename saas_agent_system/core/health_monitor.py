"""Health monitoring and self-healing for the agent fleet."""
from __future__ import annotations
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .base_agent import BaseAgent

logger = logging.getLogger(__name__)

METRICS_DIR = Path(__file__).parent.parent / "data" / "metrics"
METRICS_DIR.mkdir(parents=True, exist_ok=True)


class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class AgentHealth:
    agent_id: str
    name: str
    status: HealthStatus = HealthStatus.UNKNOWN
    last_check: float = field(default_factory=time.time)
    consecutive_failures: int = 0
    metrics: dict = field(default_factory=dict)
    alerts: list[str] = field(default_factory=list)


class HealthMonitor:
    """
    Continuously monitors all agents and triggers self-healing.
    Detects stuck agents, memory leaks, performance degradation.
    """

    def __init__(self, event_bus=None):
        self._agents: dict[str, "BaseAgent"] = {}
        self._health_records: dict[str, AgentHealth] = {}
        self._event_bus = event_bus
        self._running = False
        self._check_interval = 30  # seconds

        # Thresholds
        self.max_consecutive_failures = 3
        self.max_inactive_seconds = 600  # 10 minutes
        self.min_success_rate = 0.5

        self._metrics_path = METRICS_DIR / "agent_health.jsonl"

    def register_agent(self, agent: "BaseAgent"):
        """Register an agent for monitoring."""
        self._agents[agent.agent_id] = agent
        self._health_records[agent.agent_id] = AgentHealth(
            agent_id=agent.agent_id, name=agent.name
        )
        logger.info(f"HealthMonitor: registered {agent.name}")

    def deregister_agent(self, agent_id: str):
        self._agents.pop(agent_id, None)
        self._health_records.pop(agent_id, None)

    async def start(self):
        """Start the health monitoring loop."""
        self._running = True
        asyncio.create_task(self._monitoring_loop())
        logger.info("HealthMonitor started")

    async def stop(self):
        self._running = False

    async def _monitoring_loop(self):
        while self._running:
            try:
                await self._check_all_agents()
                await asyncio.sleep(self._check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"HealthMonitor error: {e}")
                await asyncio.sleep(5)

    async def _check_all_agents(self):
        """Run health checks on all registered agents."""
        fleet_status = {"timestamp": time.time(), "agents": {}}

        for agent_id, agent in list(self._agents.items()):
            health = await self._check_agent(agent)
            fleet_status["agents"][agent_id] = {
                "status": health.status.value,
                "alerts": health.alerts,
            }

            # Trigger healing if needed
            if health.status == HealthStatus.UNHEALTHY:
                await self._trigger_healing(agent, health)

        # Persist metrics snapshot
        self._save_metrics(fleet_status)

        if self._event_bus:
            await self._event_bus.emit("health_check", fleet_status)

    async def _check_agent(self, agent: "BaseAgent") -> AgentHealth:
        """Check a single agent's health."""
        from .base_agent import AgentStatus

        record = self._health_records.get(agent.agent_id)
        if not record:
            return AgentHealth(agent_id=agent.agent_id, name=agent.name,
                               status=HealthStatus.UNKNOWN)

        alerts = []
        metrics = agent.get_health()
        record.metrics = metrics
        record.last_check = time.time()

        # Check 1: agent not stuck in WORKING for too long
        inactive_time = time.time() - metrics.get("last_active", time.time())
        if (agent.status == AgentStatus.WORKING and
                inactive_time > self.max_inactive_seconds):
            alerts.append(f"Agent stuck: no activity for {inactive_time:.0f}s")

        # Check 2: success rate
        success_rate = metrics.get("success_rate", 1.0)
        if success_rate < self.min_success_rate:
            alerts.append(f"Low success rate: {success_rate:.1%}")

        # Check 3: agent in FAILED state
        if agent.status == AgentStatus.FAILED:
            alerts.append("Agent in FAILED state")

        # Determine health status
        if not alerts:
            record.status = HealthStatus.HEALTHY
            record.consecutive_failures = 0
        elif len(alerts) == 1:
            record.status = HealthStatus.DEGRADED
            record.consecutive_failures += 1
        else:
            record.status = HealthStatus.UNHEALTHY
            record.consecutive_failures += 1

        record.alerts = alerts

        if alerts:
            logger.warning(f"[HealthMonitor] {agent.name}: {'; '.join(alerts)}")

        return record

    async def _trigger_healing(self, agent: "BaseAgent", health: AgentHealth):
        """Trigger self-healing for an unhealthy agent."""
        from .base_agent import AgentStatus

        logger.info(f"[HealthMonitor] Healing {agent.name}...")
        agent.status = AgentStatus.HEALING
        agent.metrics["healing_events"] = agent.metrics.get("healing_events", 0) + 1

        # Reset conversation history (may be corrupted)
        agent.conversation_history = []
        agent.current_task = None

        # Reset to idle
        agent.status = AgentStatus.IDLE
        agent.metrics["last_active"] = time.time()

        if self._event_bus:
            await self._event_bus.emit("agent_healed", {
                "agent_id": agent.agent_id,
                "name": agent.name,
                "alerts_cleared": health.alerts,
            })

        logger.info(f"[HealthMonitor] {agent.name} healed successfully")

    def get_fleet_status(self) -> dict:
        """Get current health status of the entire fleet."""
        status = {}
        for agent_id, record in self._health_records.items():
            status[agent_id] = {
                "name": record.name,
                "status": record.status.value,
                "alerts": record.alerts,
                "consecutive_failures": record.consecutive_failures,
                "last_check": record.last_check,
                "metrics": record.metrics,
            }
        return status

    def _save_metrics(self, snapshot: dict):
        try:
            with open(self._metrics_path, "a") as f:
                f.write(json.dumps(snapshot) + "\n")
        except Exception:
            pass
