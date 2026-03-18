"""FastAPI application — human control plane for the AI agent fleet."""
from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Will be set when the orchestrator starts
_orchestrator = None


def set_orchestrator(orch):
    global _orchestrator
    _orchestrator = orch


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("API server starting")
    yield
    logger.info("API server stopping")


def create_app() -> FastAPI:
    app = FastAPI(
        title="SaaS AI Agent System",
        description="Control plane for the self-healing, self-learning AI agent fleet",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── Status & Health ────────────────────────────────────────────

    @app.get("/", tags=["status"])
    async def root():
        return {
            "system": "SaaS AI Agent System",
            "version": "1.0.0",
            "status": "running" if _orchestrator and _orchestrator._running else "stopped",
        }

    @app.get("/status", tags=["status"])
    async def get_status():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.get_status()

    @app.get("/metrics", tags=["status"])
    async def get_metrics():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.shared_memory.get_metrics()

    @app.get("/health", tags=["status"])
    async def health_check():
        if not _orchestrator:
            return {"status": "starting"}
        fleet = _orchestrator.health_monitor.get_fleet_status()
        unhealthy = [k for k, v in fleet.items() if v["status"] == "unhealthy"]
        return {
            "status": "healthy" if not unhealthy else "degraded",
            "unhealthy_agents": unhealthy,
            "agent_count": len(fleet),
        }

    # ─── Company State ───────────────────────────────────────────────

    @app.get("/company/state", tags=["company"])
    async def get_company_state():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.shared_memory.get_full_state()

    @app.post("/company/goals", tags=["company"])
    async def set_goals(data: dict):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        period = data.get("period", "quarterly")
        goals = data.get("goals", [])
        _orchestrator.shared_memory.set_goals(period, goals)
        return {"set": True, "period": period, "goals": len(goals)}

    @app.post("/company/metrics", tags=["company"])
    async def update_metrics(metrics: dict):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        _orchestrator.shared_memory.update_metrics(metrics)
        return {"updated": True, "fields": list(metrics.keys())}

    # ─── Agents ─────────────────────────────────────────────────────

    @app.get("/agents", tags=["agents"])
    async def list_agents():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return {k: a.get_health() for k, a in _orchestrator.agents.items()}

    @app.get("/agents/{agent_id}", tags=["agents"])
    async def get_agent(agent_id: str):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        agent = _orchestrator.agents.get(agent_id)
        if not agent:
            raise HTTPException(404, f"Agent not found: {agent_id}")
        return agent.get_health()

    # ─── Tasks ──────────────────────────────────────────────────────

    class TaskRequest(BaseModel):
        agent: str
        task_type: str
        description: str
        payload: dict = {}
        priority: int = 3

    @app.post("/tasks/dispatch", tags=["tasks"])
    async def dispatch_task(req: TaskRequest, background_tasks: BackgroundTasks):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")

        agent = _orchestrator.agents.get(req.agent)
        if not agent:
            raise HTTPException(404, f"Agent not found: {req.agent}")

        # Run task in background, return task ID immediately
        from ..core.base_agent import AgentTask
        task = AgentTask(
            type=req.task_type,
            description=req.description,
            payload=req.payload,
            priority=req.priority,
        )

        background_tasks.add_task(agent.execute_task, task)
        return {"task_id": task.task_id, "agent": req.agent, "status": "queued"}

    @app.post("/tasks/dispatch/sync", tags=["tasks"])
    async def dispatch_task_sync(req: TaskRequest):
        """Dispatch and wait for result (use for quick tasks)."""
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        try:
            result = await asyncio.wait_for(
                _orchestrator.dispatch_task(
                    req.agent, req.task_type, req.description, req.payload, req.priority
                ),
                timeout=300,
            )
            return result
        except asyncio.TimeoutError:
            raise HTTPException(504, "Task timed out after 300s")

    @app.get("/tasks/results", tags=["tasks"])
    async def get_results(limit: int = 20):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator._results[-limit:]

    # ─── Learning ───────────────────────────────────────────────────

    @app.get("/learning/stats", tags=["learning"])
    async def get_learning_stats():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.learning_engine.get_stats()

    @app.get("/learning/knowledge", tags=["learning"])
    async def get_knowledge_base(limit: int = 20, role: Optional[str] = None):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        if role:
            return _orchestrator.learning_engine.get_relevant_learnings(role, limit)
        kb = _orchestrator.learning_engine._knowledge_base
        return {
            "total": len(kb["learnings"]),
            "recent": kb["learnings"][-limit:],
        }

    @app.get("/learning/patterns", tags=["learning"])
    async def get_patterns():
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.learning_engine._patterns

    # ─── Events ─────────────────────────────────────────────────────

    @app.get("/events", tags=["events"])
    async def get_events(limit: int = 50, event_type: Optional[str] = None):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        return _orchestrator.event_bus.get_recent_events(limit, event_type)

    @app.post("/events/emit", tags=["events"])
    async def emit_event(data: dict):
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        event_type = data.get("type")
        if not event_type:
            raise HTTPException(400, "Event type required")
        await _orchestrator.event_bus.emit(event_type, data.get("data", {}), source="api")
        return {"emitted": True, "type": event_type}

    # ─── Orchestrator Control ────────────────────────────────────────

    @app.post("/orchestrator/cycle", tags=["orchestrator"])
    async def trigger_cycle():
        """Manually trigger an orchestration cycle."""
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        await _orchestrator._run_orchestration_cycle()
        return {"cycle": _orchestrator._cycle_count, "triggered": True}

    @app.post("/orchestrator/heal/{agent_id}", tags=["orchestrator"])
    async def heal_agent(agent_id: str):
        """Manually trigger healing for an agent."""
        if not _orchestrator:
            raise HTTPException(503, "Orchestrator not initialized")
        agent = _orchestrator.agents.get(agent_id)
        if not agent:
            raise HTTPException(404, f"Agent not found: {agent_id}")
        from ..core.base_agent import AgentStatus
        agent.conversation_history = []
        agent.current_task = None
        agent.status = AgentStatus.IDLE
        agent.metrics["last_active"] = 0
        return {"healed": True, "agent": agent_id}

    return app
