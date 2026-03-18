"""
SaaS Orchestrator — the CEO agent that coordinates all other agents.
Runs the main self-healing, self-learning agentic loop.
"""
from __future__ import annotations
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional

import anthropic

from ..core.base_agent import AgentTask
from ..core.event_bus import EventBus
from ..core.health_monitor import HealthMonitor
from ..core.memory import SharedMemory
from ..learning.learning_engine import LearningEngine
from ..agents import (
    ProductAgent, EngineeringAgent, SalesAgent,
    CustomerSuccessAgent, FinanceAgent, OperationsAgent,
)

logger = logging.getLogger(__name__)


ORCHESTRATOR_PROMPT = """You are the CEO AI agent orchestrating a SaaS company with a fleet of AI agents.
Your job is to:
1. Analyze the current company state and metrics
2. Identify the highest-priority work to be done
3. Delegate tasks to the most appropriate agents
4. Ensure strategic alignment across all functions
5. Make high-level decisions that affect the whole company

## Available Agents
- ProductAgent (CPO): product strategy, roadmap, user research, PMF
- EngineeringAgent (VPE): technical architecture, development, incidents, security
- SalesAgent (CRO): lead gen, pipeline, revenue, marketing
- CustomerSuccessAgent (VP CS): onboarding, retention, support, NPS
- FinanceAgent (CFO): financials, burn, runway, unit economics
- OperationsAgent (COO): processes, hiring, legal, compliance, vendors

## Decision Framework
1. Survival first: runway, incidents, churn
2. Growth second: revenue, customers, product
3. Excellence third: process, quality, culture

## Task Prioritization
- P0 (Critical): System down, major customer churn, 0 runway
- P1 (High): Revenue at risk, security incident, key hire
- P2 (Medium): Roadmap, pipeline, metrics, processes
- P3 (Low): Documentation, optimization, nice-to-haves

Always generate 3-7 concrete tasks per cycle. Be specific about what each agent should do.
Output as JSON with tasks array."""


class SaaSOrchestrator:
    """
    The central orchestrator that runs the SaaS company.
    Implements the self-healing, self-learning agentic loop.
    """

    def __init__(self, config: dict = None):
        self.config = config or {}
        self._client = anthropic.AsyncAnthropic()

        # Core infrastructure
        self.event_bus = EventBus()
        self.shared_memory = SharedMemory()
        self.learning_engine = LearningEngine(event_bus=self.event_bus)
        self.health_monitor = HealthMonitor(event_bus=self.event_bus)

        # Initialize all agents
        agent_kwargs = dict(
            shared_memory=self.shared_memory,
            event_bus=self.event_bus,
            learning_engine=self.learning_engine,
        )
        self.agents = {
            "product": ProductAgent(**agent_kwargs),
            "engineering": EngineeringAgent(**agent_kwargs),
            "sales": SalesAgent(**agent_kwargs),
            "customer_success": CustomerSuccessAgent(**agent_kwargs),
            "finance": FinanceAgent(**agent_kwargs),
            "operations": OperationsAgent(**agent_kwargs),
        }

        # Register all agents with health monitor
        for agent in self.agents.values():
            self.health_monitor.register_agent(agent)

        # Orchestrator state
        self._running = False
        self._cycle_count = 0
        self._cycle_interval = self.config.get("cycle_interval_seconds", 60)
        self._task_queue: asyncio.Queue = asyncio.Queue()
        self._results: list[dict] = []

        # Subscribe to events
        self._setup_event_handlers()

        logger.info("SaaSOrchestrator initialized with %d agents", len(self.agents))

    def _setup_event_handlers(self):
        """Subscribe to critical business events."""
        self.event_bus.subscribe("incident_detected", self._on_incident)
        self.event_bus.subscribe("customer_churned", self._on_churn)
        self.event_bus.subscribe("help_requested", self._on_help_requested)
        self.event_bus.subscribe("deal_closed", self._on_deal_closed)
        self.event_bus.subscribe("task_failed", self._on_task_failed)
        self.event_bus.subscribe_all(self._on_any_event)

    async def start(self):
        """Start the SaaS agent system."""
        logger.info("🚀 SaaSOrchestrator starting...")

        await self.event_bus.start()
        await self.health_monitor.start()
        await self.learning_engine.start()

        self._running = True

        # Run company initialization if first time
        state = self.shared_memory.get_full_state()
        if state["metrics"]["mrr"] == 0 and self._cycle_count == 0:
            await self._run_initialization()

        # Start the main orchestration loop
        asyncio.create_task(self._orchestration_loop())
        asyncio.create_task(self._task_processor())

        logger.info("✅ SaaSOrchestrator running — all agents active")

    async def stop(self):
        """Graceful shutdown of all agents and services."""
        logger.info("Shutting down SaaSOrchestrator...")
        self._running = False

        for agent in self.agents.values():
            await agent.shutdown()

        await self.health_monitor.stop()
        await self.learning_engine.stop()
        await self.event_bus.stop()

        logger.info("SaaSOrchestrator shut down cleanly")

    async def _run_initialization(self):
        """First-time company setup — all agents do initial planning."""
        logger.info("Running company initialization...")

        init_tasks = [
            AgentTask(
                type="initial_strategy",
                description="Define the initial product strategy, ICP, positioning, and 3-month roadmap",
                payload={"stage": "early", "context": "Building a new SaaS company from scratch"},
                priority=1,
            ),
            AgentTask(
                type="initial_setup",
                description="Set up company financial model, initial budget allocation, and track key SaaS metrics",
                payload={"stage": "early"},
                priority=1,
            ),
            AgentTask(
                type="initial_planning",
                description="Create initial sales pipeline, ICP definition, and first outreach strategy",
                payload={"stage": "early"},
                priority=1,
            ),
            AgentTask(
                type="initial_setup",
                description="Define engineering stack, set up CI/CD best practices, and create technical roadmap",
                payload={"stage": "early"},
                priority=1,
            ),
            AgentTask(
                type="initial_setup",
                description="Create core company processes: hiring, onboarding, communication, OKRs",
                payload={"stage": "early"},
                priority=1,
            ),
        ]

        agent_list = [
            self.agents["product"],
            self.agents["finance"],
            self.agents["sales"],
            self.agents["engineering"],
            self.agents["operations"],
        ]

        results = await asyncio.gather(*[
            agent.execute_task(task)
            for agent, task in zip(agent_list, init_tasks)
        ], return_exceptions=True)

        success_count = sum(1 for r in results if hasattr(r, 'success') and r.success)
        logger.info(f"Initialization complete: {success_count}/{len(init_tasks)} tasks succeeded")

    async def _orchestration_loop(self):
        """Main orchestration loop — runs every cycle_interval seconds."""
        while self._running:
            try:
                await asyncio.sleep(self._cycle_interval)
                self._cycle_count += 1
                await self._run_orchestration_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Orchestration loop error: {e}")
                await asyncio.sleep(10)

    async def _run_orchestration_cycle(self):
        """Single orchestration cycle — CEO analyzes state and delegates."""
        logger.info(f"🔄 Orchestration cycle #{self._cycle_count}")

        # Get current company state
        state = self.shared_memory.get_full_state()
        fleet_health = self.health_monitor.get_fleet_status()
        learning_stats = self.learning_engine.get_stats()
        recent_events = self.event_bus.get_recent_events(limit=10)

        # Build CEO context
        context = {
            "cycle": self._cycle_count,
            "company_state": state,
            "fleet_health": fleet_health,
            "learning_stats": learning_stats,
            "recent_events": recent_events,
            "timestamp": time.time(),
        }

        # Ask CEO agent to generate tasks
        tasks = await self._generate_tasks(context)

        # Queue all generated tasks
        for task_def in tasks:
            await self._task_queue.put(task_def)

        await self.event_bus.emit("orchestrator_cycle", {
            "cycle": self._cycle_count,
            "tasks_generated": len(tasks),
        })

        logger.info(f"Cycle #{self._cycle_count}: generated {len(tasks)} tasks")

    async def _generate_tasks(self, context: dict) -> list[dict]:
        """Use Claude to generate tasks based on current state."""
        state_summary = {
            "metrics": context["company_state"].get("metrics", {}),
            "product": context["company_state"].get("product", {}),
            "pipeline": context["company_state"].get("pipeline", {}),
            "support": context["company_state"].get("support", {}),
            "engineering": context["company_state"].get("engineering", {}),
        }

        prompt = f"""Current company state (cycle #{context['cycle']}):
{json.dumps(state_summary, indent=2, default=str)}

Recent events:
{json.dumps(context['recent_events'][-5:], indent=2, default=str)}

Agent fleet health:
{json.dumps({k: v['status'] for k, v in context['fleet_health'].items()}, indent=2)}

Generate 3-5 high-priority tasks for the agent fleet right now.

Output JSON array:
[
  {{
    "agent": "product|engineering|sales|customer_success|finance|operations",
    "type": "task_type",
    "description": "Detailed description of what the agent should do",
    "priority": 1-5,
    "payload": {{}}
  }}
]

Focus on the highest-impact actions given current metrics and stage."""

        try:
            response = await self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=2048,
                thinking={"type": "adaptive"},
                system=ORCHESTRATOR_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )

            for block in response.content:
                if hasattr(block, "text"):
                    text = block.text
                    start = text.find("[")
                    end = text.rfind("]") + 1
                    if start >= 0 and end > start:
                        tasks = json.loads(text[start:end])
                        return tasks

        except Exception as e:
            logger.error(f"Task generation failed: {e}")

        # Fallback: default tasks if CEO fails
        return self._default_tasks()

    def _default_tasks(self) -> list[dict]:
        """Fallback tasks when orchestrator fails."""
        return [
            {
                "agent": "sales",
                "type": "pipeline_review",
                "description": "Review current pipeline, identify top 3 deals to advance, and create 5 new outreach messages",
                "priority": 2,
                "payload": {},
            },
            {
                "agent": "product",
                "type": "metrics_review",
                "description": "Analyze current product metrics, identify top user pain points, and update roadmap priorities",
                "priority": 2,
                "payload": {},
            },
            {
                "agent": "customer_success",
                "type": "health_check",
                "description": "Run customer health check, identify any churn risks, and create engagement plans",
                "priority": 2,
                "payload": {},
            },
        ]

    async def _task_processor(self):
        """Process tasks from the queue and route to agents."""
        while self._running:
            try:
                task_def = await asyncio.wait_for(self._task_queue.get(), timeout=5.0)
                asyncio.create_task(self._execute_task(task_def))
                self._task_queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Task processor error: {e}")

    async def _execute_task(self, task_def: dict):
        """Route a task to the appropriate agent and process the result."""
        agent_key = task_def.get("agent", "operations")
        agent = self.agents.get(agent_key)
        if not agent:
            logger.error(f"Unknown agent: {agent_key}")
            return

        task = AgentTask(
            type=task_def.get("type", "general"),
            description=task_def.get("description", ""),
            payload=task_def.get("payload", {}),
            priority=task_def.get("priority", 5),
        )

        result = await agent.execute_task(task)

        # Store result in shared memory
        self.shared_memory.store_agent_output(
            agent.agent_id, task.type, result.output
        )

        # Feed result back to learning engine
        if result.success:
            await self.learning_engine.record_task_result({
                "agent_id": agent.agent_id,
                "agent_role": agent.role,
                "task_type": task.type,
                "success": True,
                "output": str(result.output)[:500] if result.output else "",
            })

        # Store learnings
        for learning in result.learnings:
            await self.learning_engine.record_learning({
                "agent_id": agent.agent_id,
                "agent_role": agent.role,
                "learning": learning,
                "category": "process",
                "confidence": 0.8,
            })

        self._results.append(result.to_dict())

    async def dispatch_task(self, agent_key: str, task_type: str,
                              description: str, payload: dict = None,
                              priority: int = 3) -> dict:
        """Manually dispatch a task to an agent (for API/CLI use)."""
        agent = self.agents.get(agent_key)
        if not agent:
            return {"error": f"Agent not found: {agent_key}"}

        task = AgentTask(
            type=task_type,
            description=description,
            payload=payload or {},
            priority=priority,
        )

        result = await agent.execute_task(task)
        return result.to_dict()

    # Event handlers
    async def _on_incident(self, event):
        """Priority response to production incidents."""
        incident = event.data
        severity = incident.get("severity", "sev3")
        if severity in ("sev1", "sev2"):
            logger.warning(f"🚨 HIGH SEVERITY INCIDENT: {incident.get('description', '')[:80]}")
            await self._task_queue.put({
                "agent": "engineering",
                "type": "incident_response",
                "description": f"URGENT: Respond to {severity} incident: {incident.get('description')}",
                "priority": 1,
                "payload": incident,
            })

    async def _on_churn(self, event):
        """Respond to customer churn events."""
        churn = event.data
        arr = churn.get("arr_lost", 0)
        if arr > 10000:
            await self._task_queue.put({
                "agent": "customer_success",
                "type": "churn_analysis",
                "description": f"Analyze churn of {churn.get('customer')} (${arr:,.0f} ARR). Root cause analysis and prevention plan.",
                "priority": 1,
                "payload": churn,
            })

    async def _on_help_requested(self, event):
        """Route help requests to appropriate agents."""
        help_req = event.data
        urgency = help_req.get("urgency", "medium")
        needed = help_req.get("needed_capability", "")
        logger.info(f"Help requested [{urgency}]: {help_req.get('issue', '')[:80]}")

        # Try to find a capable agent
        for agent_key, agent in self.agents.items():
            if any(needed in cap for cap in agent.capabilities):
                await self._task_queue.put({
                    "agent": agent_key,
                    "type": "assist",
                    "description": f"Help needed: {help_req.get('issue')}",
                    "priority": 2 if urgency in ("high", "critical") else 4,
                    "payload": help_req,
                })
                break

    async def _on_deal_closed(self, event):
        """Update financials when a deal closes."""
        deal = event.data
        if deal.get("outcome") == "won":
            logger.info(f"💰 Deal closed: {deal.get('company')} — ${deal.get('arr', 0):,.0f} ARR")

    async def _on_task_failed(self, event):
        """Track and respond to task failures."""
        failure = event.data
        logger.warning(f"Task failed: {failure.get('task_id')} — {failure.get('error', '')[:80]}")

    async def _on_any_event(self, event):
        """Log all events for audit trail."""
        pass  # Already logged by event bus

    def get_status(self) -> dict:
        """Get full system status."""
        return {
            "orchestrator": {
                "running": self._running,
                "cycle_count": self._cycle_count,
                "queue_size": self._task_queue.qsize(),
                "total_results": len(self._results),
            },
            "metrics": self.shared_memory.get_metrics(),
            "agents": {k: a.get_health() for k, a in self.agents.items()},
            "fleet_health": self.health_monitor.get_fleet_status(),
            "learning": self.learning_engine.get_stats(),
            "recent_results": self._results[-10:],
        }
