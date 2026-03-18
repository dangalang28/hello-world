"""Async event bus for inter-agent communication."""
from __future__ import annotations
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

LOGS_DIR = Path(__file__).parent.parent / "data" / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)


class EventType(str, Enum):
    # Agent lifecycle
    AGENT_STARTED = "agent_started"
    AGENT_STOPPED = "agent_stopped"
    AGENT_STATUS_UPDATE = "agent_status_update"
    AGENT_HEALED = "agent_healed"

    # Task lifecycle
    TASK_QUEUED = "task_queued"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_RETRYING = "task_retrying"

    # Business events
    NEW_CUSTOMER = "new_customer"
    CUSTOMER_CHURNED = "customer_churned"
    REVENUE_UPDATED = "revenue_updated"
    INCIDENT_DETECTED = "incident_detected"
    INCIDENT_RESOLVED = "incident_resolved"
    FEATURE_SHIPPED = "feature_shipped"
    LEAD_CAPTURED = "lead_captured"
    DEAL_CLOSED = "deal_closed"
    SUPPORT_TICKET = "support_ticket"

    # Cross-agent
    HELP_REQUESTED = "help_requested"
    LEARNING_RECORDED = "learning_recorded"
    GOAL_UPDATED = "goal_updated"

    # System
    ORCHESTRATOR_CYCLE = "orchestrator_cycle"
    HEALTH_CHECK = "health_check"
    SHUTDOWN = "shutdown"


@dataclass
class Event:
    type: str
    data: dict = field(default_factory=dict)
    source: Optional[str] = None
    event_id: str = field(default_factory=lambda: str(time.time_ns()))
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "type": self.type,
            "source": self.source,
            "data": self.data,
            "timestamp": self.timestamp,
        }


class EventBus:
    """
    Async publish-subscribe event bus with persistence.
    Enables decoupled communication between agents.
    """

    def __init__(self):
        self._subscribers: dict[str, list[Callable]] = {}
        self._wildcard_subscribers: list[Callable] = []
        self._event_log_path = LOGS_DIR / "events.jsonl"
        self._queue: asyncio.Queue = asyncio.Queue()
        self._running = False
        self._processor_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the event bus processor."""
        self._running = True
        self._processor_task = asyncio.create_task(self._process_events())
        logger.info("EventBus started")

    async def stop(self):
        """Stop the event bus."""
        self._running = False
        if self._processor_task:
            self._processor_task.cancel()
        logger.info("EventBus stopped")

    def subscribe(self, event_type: str, handler: Callable):
        """Subscribe to events of a specific type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)

    def subscribe_all(self, handler: Callable):
        """Subscribe to all events."""
        self._wildcard_subscribers.append(handler)

    def unsubscribe(self, event_type: str, handler: Callable):
        if event_type in self._subscribers:
            self._subscribers[event_type].remove(handler)

    async def emit(self, event_type: str, data: dict = None, source: str = None):
        """Emit an event asynchronously."""
        event = Event(type=event_type, data=data or {}, source=source)
        await self._queue.put(event)

    async def emit_sync(self, event_type: str, data: dict = None, source: str = None):
        """Emit and wait for all handlers to complete."""
        event = Event(type=event_type, data=data or {}, source=source)
        await self._dispatch(event)

    async def _process_events(self):
        """Background event processing loop."""
        while self._running:
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await self._dispatch(event)
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"EventBus error: {e}")

    async def _dispatch(self, event: Event):
        """Dispatch event to all relevant subscribers."""
        self._log_event(event)

        handlers = (
            self._subscribers.get(event.type, []) + self._wildcard_subscribers
        )

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"EventBus handler error for {event.type}: {e}")

    def _log_event(self, event: Event):
        """Persist event to log file."""
        try:
            with open(self._event_log_path, "a") as f:
                f.write(json.dumps(event.to_dict()) + "\n")
        except Exception:
            pass

    def get_recent_events(self, limit: int = 50, event_type: str = None) -> list[dict]:
        """Read recent events from log."""
        events = []
        try:
            if self._event_log_path.exists():
                lines = self._event_log_path.read_text().strip().split("\n")
                for line in reversed(lines):
                    if not line:
                        continue
                    try:
                        ev = json.loads(line)
                        if event_type is None or ev.get("type") == event_type:
                            events.append(ev)
                            if len(events) >= limit:
                                break
                    except Exception:
                        continue
        except Exception:
            pass
        return events
