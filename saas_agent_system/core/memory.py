"""Persistent memory system for agents."""
from __future__ import annotations
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data" / "memory"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class AgentMemory:
    """Per-agent episodic memory with persistence."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._path = DATA_DIR / f"{agent_id}.json"
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            try:
                return json.loads(self._path.read_text())
            except Exception:
                pass
        return {"episodes": [], "facts": {}, "preferences": {}}

    def _save(self):
        self._path.write_text(json.dumps(self._data, indent=2))

    def store_episode(self, episode: dict):
        """Store a task episode for future reference."""
        with self._lock:
            episode["timestamp"] = time.time()
            self._data["episodes"].append(episode)
            # Keep last 500 episodes
            if len(self._data["episodes"]) > 500:
                self._data["episodes"] = self._data["episodes"][-500:]
            self._save()

    def store_fact(self, key: str, value: Any):
        """Store a persistent fact."""
        with self._lock:
            self._data["facts"][key] = {"value": value, "updated": time.time()}
            self._save()

    def get_fact(self, key: str) -> Optional[Any]:
        entry = self._data["facts"].get(key)
        return entry["value"] if entry else None

    def get_recent_episodes(self, limit: int = 10) -> list[dict]:
        return self._data["episodes"][-limit:]

    def search_episodes(self, keyword: str, limit: int = 5) -> list[dict]:
        keyword_lower = keyword.lower()
        matches = [
            ep for ep in self._data["episodes"]
            if keyword_lower in json.dumps(ep).lower()
        ]
        return matches[-limit:]

    def set_preference(self, key: str, value: Any):
        with self._lock:
            self._data["preferences"][key] = value
            self._save()

    def get_preference(self, key: str, default: Any = None) -> Any:
        return self._data["preferences"].get(key, default)


class SharedMemory:
    """
    Shared memory across all agents — the single source of truth
    for company state, KPIs, and cross-agent communication.
    """

    def __init__(self):
        self._path = DATA_DIR / "shared_state.json"
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            try:
                return json.loads(self._path.read_text())
            except Exception:
                pass
        return self._default_state()

    def _default_state(self) -> dict:
        return {
            "company": {
                "name": "SaaS Co",
                "stage": "early",
                "founded": time.time(),
            },
            "metrics": {
                "mrr": 0,
                "arr": 0,
                "customers": 0,
                "churn_rate": 0,
                "nps": 0,
                "cac": 0,
                "ltv": 0,
                "runway_months": 0,
                "burn_rate": 0,
            },
            "product": {
                "version": "0.1.0",
                "features": [],
                "bugs_open": 0,
                "bugs_resolved": 0,
                "uptime_pct": 100.0,
            },
            "pipeline": {
                "leads": 0,
                "opportunities": 0,
                "demos_scheduled": 0,
                "trials_active": 0,
                "deals_closed_mtd": 0,
            },
            "support": {
                "tickets_open": 0,
                "tickets_resolved": 0,
                "avg_response_time_hrs": 0,
                "satisfaction_score": 0,
            },
            "engineering": {
                "deploy_frequency": 0,
                "lead_time_hours": 0,
                "incident_count": 0,
                "test_coverage_pct": 0,
            },
            "contexts": {},
            "agent_outputs": {},
            "decisions": [],
            "goals": {
                "quarterly": [],
                "monthly": [],
                "weekly": [],
            },
            "updated_at": time.time(),
        }

    def _save(self):
        self._data["updated_at"] = time.time()
        self._path.write_text(json.dumps(self._data, indent=2, default=str))

    def update_metrics(self, updates: dict):
        """Update company KPI metrics."""
        with self._lock:
            for key, value in updates.items():
                if key in self._data["metrics"]:
                    self._data["metrics"][key] = value
            self._save()
        logger.info(f"Metrics updated: {list(updates.keys())}")

    def get_metrics(self) -> dict:
        return dict(self._data.get("metrics", {}))

    def set_context(self, key: str, value: Any):
        """Store agent-specific context."""
        with self._lock:
            self._data["contexts"][key] = {
                "value": value,
                "updated": time.time(),
            }
            self._save()

    def get_context(self, key: str) -> Optional[Any]:
        entry = self._data["contexts"].get(key)
        return entry["value"] if entry else None

    def store_agent_output(self, agent_id: str, task_type: str, output: Any):
        """Store agent task output for cross-agent visibility."""
        with self._lock:
            if agent_id not in self._data["agent_outputs"]:
                self._data["agent_outputs"][agent_id] = {}
            self._data["agent_outputs"][agent_id][task_type] = {
                "output": output,
                "timestamp": time.time(),
            }
            self._save()

    def get_agent_output(self, agent_id: str, task_type: str) -> Optional[Any]:
        outputs = self._data["agent_outputs"].get(agent_id, {})
        entry = outputs.get(task_type)
        return entry["output"] if entry else None

    def log_decision(self, decision: dict):
        """Log a strategic decision for audit trail."""
        with self._lock:
            decision["timestamp"] = time.time()
            self._data["decisions"].append(decision)
            if len(self._data["decisions"]) > 1000:
                self._data["decisions"] = self._data["decisions"][-1000:]
            self._save()

    def set_goals(self, period: str, goals: list[str]):
        """Set company goals for a period."""
        with self._lock:
            if period in self._data["goals"]:
                self._data["goals"][period] = goals
                self._save()

    def get_full_state(self) -> dict:
        return dict(self._data)

    def update_section(self, section: str, updates: dict):
        """Update a top-level section of state."""
        with self._lock:
            if section in self._data:
                if isinstance(self._data[section], dict):
                    self._data[section].update(updates)
                else:
                    self._data[section] = updates
            else:
                self._data[section] = updates
            self._save()
