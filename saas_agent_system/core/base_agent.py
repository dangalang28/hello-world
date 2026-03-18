"""Base agent class with self-healing capabilities."""
from __future__ import annotations
import asyncio
import json
import logging
import time
import traceback
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

import anthropic

logger = logging.getLogger(__name__)


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    HEALING = "healing"
    FAILED = "failed"
    TERMINATED = "terminated"


@dataclass
class AgentTask:
    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = ""
    description: str = ""
    payload: dict = field(default_factory=dict)
    priority: int = 5  # 1=highest, 10=lowest
    retries: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    timeout: float = 120.0


@dataclass
class TaskResult:
    task_id: str
    agent_id: str
    success: bool
    output: Any = None
    error: Optional[str] = None
    duration: float = 0.0
    tokens_used: int = 0
    learnings: list[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "duration": self.duration,
            "tokens_used": self.tokens_used,
            "learnings": self.learnings,
            "timestamp": self.timestamp,
        }


class BaseAgent:
    """
    Self-healing, self-learning base agent.
    Each specialized agent extends this class.
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        role: str,
        capabilities: list[str],
        system_prompt: str,
        model: str = "claude-opus-4-6",
        shared_memory=None,
        event_bus=None,
        learning_engine=None,
    ):
        self.agent_id = agent_id
        self.name = name
        self.role = role
        self.capabilities = capabilities
        self.system_prompt = system_prompt
        self.model = model
        self.shared_memory = shared_memory
        self.event_bus = event_bus
        self.learning_engine = learning_engine

        self.status = AgentStatus.IDLE
        self.current_task: Optional[AgentTask] = None
        self.conversation_history: list[dict] = []
        self.metrics = {
            "tasks_completed": 0,
            "tasks_failed": 0,
            "total_tokens": 0,
            "uptime_start": time.time(),
            "last_active": time.time(),
            "healing_events": 0,
        }
        self._tools: list[dict] = []
        self._tool_handlers: dict[str, Callable] = {}
        self._client = anthropic.AsyncAnthropic()
        self._running = True

        self._register_default_tools()
        logger.info(f"[{self.name}] Agent initialized | role={self.role}")

    def _register_default_tools(self):
        """Register tools available to all agents."""
        self.register_tool(
            name="report_status",
            description="Report current status and progress on a task",
            input_schema={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Current status message"},
                    "progress_pct": {"type": "number", "description": "Progress 0-100"},
                    "blockers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["status"],
            },
            handler=self._handle_report_status,
        )
        self.register_tool(
            name="log_learning",
            description="Log a learning or insight discovered during task execution",
            input_schema={
                "type": "object",
                "properties": {
                    "learning": {"type": "string", "description": "The insight or learning"},
                    "category": {"type": "string", "description": "Category: process/technical/market/customer"},
                    "confidence": {"type": "number", "description": "Confidence 0-1"},
                },
                "required": ["learning", "category"],
            },
            handler=self._handle_log_learning,
        )
        self.register_tool(
            name="request_help",
            description="Request assistance from another agent or escalate to human",
            input_schema={
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "needed_capability": {"type": "string"},
                    "urgency": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                },
                "required": ["issue", "urgency"],
            },
            handler=self._handle_request_help,
        )

    def register_tool(self, name: str, description: str, input_schema: dict, handler: Callable):
        """Register a tool this agent can use."""
        self._tools.append({
            "name": name,
            "description": description,
            "input_schema": input_schema,
        })
        self._tool_handlers[name] = handler

    def _handle_report_status(self, status: str, progress_pct: float = 0, blockers: list = None):
        if self.event_bus:
            asyncio.create_task(self.event_bus.emit("agent_status_update", {
                "agent_id": self.agent_id,
                "status": status,
                "progress": progress_pct,
                "blockers": blockers or [],
            }))
        logger.info(f"[{self.name}] Status: {status} ({progress_pct}%)")
        return {"acknowledged": True}

    def _handle_log_learning(self, learning: str, category: str, confidence: float = 0.8):
        if self.learning_engine:
            asyncio.create_task(self.learning_engine.record_learning({
                "agent_id": self.agent_id,
                "agent_role": self.role,
                "learning": learning,
                "category": category,
                "confidence": confidence,
                "timestamp": time.time(),
            }))
        logger.info(f"[{self.name}] Learning logged: [{category}] {learning[:80]}")
        return {"recorded": True}

    def _handle_request_help(self, issue: str, urgency: str, needed_capability: str = None):
        if self.event_bus:
            asyncio.create_task(self.event_bus.emit("help_requested", {
                "from_agent": self.agent_id,
                "issue": issue,
                "needed_capability": needed_capability,
                "urgency": urgency,
            }))
        logger.warning(f"[{self.name}] Help requested [{urgency}]: {issue}")
        return {"request_received": True}

    def _build_system_prompt(self) -> str:
        """Build enriched system prompt with learnings and context."""
        base = self.system_prompt

        # Inject relevant learnings from memory
        if self.learning_engine:
            learnings = self.learning_engine.get_relevant_learnings(self.role, limit=5)
            if learnings:
                lessons = "\n".join(f"- {l['learning']}" for l in learnings)
                base += f"\n\n## Accumulated Learnings\nApply these insights from past experience:\n{lessons}"

        # Inject company context from shared memory
        if self.shared_memory:
            ctx = self.shared_memory.get_context("company_state")
            if ctx:
                base += f"\n\n## Current Company State\n{json.dumps(ctx, indent=2)}"

        return base

    async def execute_task(self, task: AgentTask) -> TaskResult:
        """Execute a task with the agentic loop and self-healing."""
        self.current_task = task
        self.status = AgentStatus.WORKING
        self.metrics["last_active"] = time.time()
        start_time = time.time()
        learnings = []
        total_tokens = 0

        logger.info(f"[{self.name}] Starting task: {task.description[:80]}")

        if self.event_bus:
            await self.event_bus.emit("task_started", {
                "agent_id": self.agent_id,
                "task_id": task.task_id,
                "task_type": task.type,
            })

        messages = [{"role": "user", "content": self._build_task_prompt(task)}]

        try:
            result_output = await self._run_agentic_loop(messages, task.timeout)
            total_tokens = result_output.get("tokens", 0)
            learnings = result_output.get("learnings", [])
            output = result_output.get("output", "")

            self.metrics["tasks_completed"] += 1
            self.metrics["total_tokens"] += total_tokens
            self.status = AgentStatus.IDLE
            duration = time.time() - start_time

            if self.event_bus:
                await self.event_bus.emit("task_completed", {
                    "agent_id": self.agent_id,
                    "task_id": task.task_id,
                    "duration": duration,
                    "tokens": total_tokens,
                })

            return TaskResult(
                task_id=task.task_id,
                agent_id=self.agent_id,
                success=True,
                output=output,
                duration=duration,
                tokens_used=total_tokens,
                learnings=learnings,
            )

        except asyncio.TimeoutError:
            return await self._handle_failure(task, "Task timed out", start_time)
        except anthropic.RateLimitError as e:
            logger.warning(f"[{self.name}] Rate limited, backing off...")
            await asyncio.sleep(30)
            return await self._handle_failure(task, f"Rate limit: {e}", start_time)
        except Exception as e:
            tb = traceback.format_exc()
            return await self._handle_failure(task, f"{type(e).__name__}: {e}\n{tb}", start_time)

    async def _run_agentic_loop(self, messages: list[dict], timeout: float) -> dict:
        """Run the Claude agentic loop with tool use."""
        learnings = []
        total_tokens = 0
        final_output = ""

        async def _loop():
            nonlocal total_tokens, final_output

            while True:
                stream = await self._client.messages.create(
                    model=self.model,
                    max_tokens=8192,
                    thinking={"type": "adaptive"},
                    system=self._build_system_prompt(),
                    tools=self._tools,
                    messages=messages,
                    stream=True,
                )

                response = await stream.get_final_message()
                total_tokens += response.usage.input_tokens + response.usage.output_tokens

                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "end_turn":
                    for block in response.content:
                        if hasattr(block, "text"):
                            final_output += block.text
                    break

                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = await self._execute_tool(block.name, block.input)
                            # Capture learnings from log_learning tool
                            if block.name == "log_learning" and "recorded" in str(result):
                                learnings.append(block.input.get("learning", ""))
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(result),
                            })
                    messages.append({"role": "user", "content": tool_results})
                    continue

                break

        await asyncio.wait_for(_loop(), timeout=timeout)
        return {"output": final_output, "tokens": total_tokens, "learnings": learnings}

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> dict:
        """Execute a registered tool."""
        handler = self._tool_handlers.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}
        try:
            if asyncio.iscoroutinefunction(handler):
                return await handler(**tool_input)
            return handler(**tool_input)
        except Exception as e:
            logger.error(f"[{self.name}] Tool '{tool_name}' error: {e}")
            return {"error": str(e)}

    def _build_task_prompt(self, task: AgentTask) -> str:
        """Build the task execution prompt."""
        prompt = f"""## Task Assignment

**Type:** {task.type}
**Priority:** {task.priority}/10
**Description:** {task.description}
"""
        if task.payload:
            prompt += f"\n**Context/Data:**\n```json\n{json.dumps(task.payload, indent=2)}\n```"

        prompt += """

Please complete this task thoroughly. Use available tools to:
1. Report status as you work
2. Log any valuable learnings or insights
3. Request help if blocked

Provide a comprehensive result when done."""
        return prompt

    async def _handle_failure(self, task: AgentTask, error: str, start_time: float) -> TaskResult:
        """Handle task failure with self-healing."""
        self.metrics["tasks_failed"] += 1
        self.metrics["healing_events"] += 1
        duration = time.time() - start_time
        self.status = AgentStatus.HEALING

        logger.error(f"[{self.name}] Task failed: {error[:200]}")

        # Attempt retry with backoff
        if task.retries < task.max_retries:
            task.retries += 1
            backoff = 2 ** task.retries
            logger.info(f"[{self.name}] Self-healing: retry {task.retries}/{task.max_retries} in {backoff}s")
            await asyncio.sleep(backoff)
            self.status = AgentStatus.WORKING
            return await self.execute_task(task)

        self.status = AgentStatus.IDLE

        if self.event_bus:
            await self.event_bus.emit("task_failed", {
                "agent_id": self.agent_id,
                "task_id": task.task_id,
                "error": error[:500],
                "retries_exhausted": True,
            })

        return TaskResult(
            task_id=task.task_id,
            agent_id=self.agent_id,
            success=False,
            error=error[:500],
            duration=duration,
        )

    def get_health(self) -> dict:
        """Return agent health metrics."""
        uptime = time.time() - self.metrics["uptime_start"]
        total_tasks = self.metrics["tasks_completed"] + self.metrics["tasks_failed"]
        success_rate = (
            self.metrics["tasks_completed"] / total_tasks if total_tasks > 0 else 1.0
        )
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "role": self.role,
            "status": self.status.value,
            "uptime_seconds": uptime,
            "tasks_completed": self.metrics["tasks_completed"],
            "tasks_failed": self.metrics["tasks_failed"],
            "success_rate": success_rate,
            "total_tokens": self.metrics["total_tokens"],
            "healing_events": self.metrics["healing_events"],
            "last_active": self.metrics["last_active"],
        }

    async def shutdown(self):
        """Graceful shutdown."""
        self._running = False
        self.status = AgentStatus.TERMINATED
        logger.info(f"[{self.name}] Agent shut down")
