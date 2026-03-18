"""
Self-learning engine — captures insights from agent work, identifies patterns,
and continuously improves agent prompts and strategies.
"""
from __future__ import annotations
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

import anthropic

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).parent.parent / "data" / "knowledge"
KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)


class LearningEngine:
    """
    The brain of self-improvement. Collects learnings from all agents,
    synthesizes patterns, and feeds improvements back into agent behavior.
    """

    def __init__(self, event_bus=None):
        self._event_bus = event_bus
        self._client = anthropic.AsyncAnthropic()
        self._knowledge_path = KNOWLEDGE_DIR / "knowledge_base.json"
        self._patterns_path = KNOWLEDGE_DIR / "patterns.json"
        self._improvements_path = KNOWLEDGE_DIR / "prompt_improvements.json"

        self._knowledge_base = self._load_json(self._knowledge_path, {
            "learnings": [],
            "by_agent": {},
            "by_category": {},
        })
        self._patterns = self._load_json(self._patterns_path, {"patterns": []})
        self._improvements = self._load_json(self._improvements_path, {"improvements": {}})

        self._synthesis_interval = 300  # synthesize every 5 minutes
        self._running = False

    def _load_json(self, path: Path, default: dict) -> dict:
        if path.exists():
            try:
                return json.loads(path.read_text())
            except Exception:
                pass
        return default

    def _save_all(self):
        self._knowledge_path.write_text(json.dumps(self._knowledge_base, indent=2, default=str))
        self._patterns_path.write_text(json.dumps(self._patterns, indent=2, default=str))
        self._improvements_path.write_text(json.dumps(self._improvements, indent=2, default=str))

    async def start(self):
        """Start the learning engine background loop."""
        self._running = True
        asyncio.create_task(self._synthesis_loop())
        logger.info("LearningEngine started")

    async def stop(self):
        self._running = False

    async def record_learning(self, learning: dict):
        """Record a new learning from any agent."""
        learning["id"] = f"L{int(time.time_ns())}"
        learning["recorded_at"] = time.time()

        # Add to global list
        self._knowledge_base["learnings"].append(learning)

        # Index by agent
        agent_id = learning.get("agent_id", "unknown")
        if agent_id not in self._knowledge_base["by_agent"]:
            self._knowledge_base["by_agent"][agent_id] = []
        self._knowledge_base["by_agent"][agent_id].append(learning["id"])

        # Index by category
        category = learning.get("category", "general")
        if category not in self._knowledge_base["by_category"]:
            self._knowledge_base["by_category"][category] = []
        self._knowledge_base["by_category"][category].append(learning["id"])

        # Keep last 2000 learnings
        if len(self._knowledge_base["learnings"]) > 2000:
            self._knowledge_base["learnings"] = self._knowledge_base["learnings"][-2000:]

        self._save_all()
        logger.debug(f"LearningEngine: recorded learning [{category}]: {learning.get('learning', '')[:60]}")

    async def record_task_result(self, result: dict):
        """Record a task result for pattern analysis."""
        # Auto-extract learnings from successful results
        if result.get("success") and result.get("output"):
            await self.record_learning({
                "agent_id": result.get("agent_id"),
                "agent_role": result.get("agent_role", "unknown"),
                "learning": f"Successful approach for {result.get('task_type', 'task')}: "
                           f"{str(result.get('output', ''))[:200]}",
                "category": "process",
                "confidence": 0.7,
                "source": "task_result",
            })

    def get_relevant_learnings(self, agent_role: str, limit: int = 5) -> list[dict]:
        """Get the most relevant learnings for an agent role."""
        learnings = self._knowledge_base["learnings"]

        # Filter by role relevance and sort by confidence
        relevant = [
            l for l in learnings
            if (l.get("agent_role") == agent_role or
                agent_role in str(l.get("learning", "")).lower())
            and l.get("confidence", 0) > 0.5
        ]

        # Also include high-confidence cross-agent learnings
        cross_agent = [
            l for l in learnings
            if l.get("confidence", 0) > 0.85
            and l not in relevant
        ]

        combined = relevant + cross_agent
        # Sort by confidence and recency
        combined.sort(key=lambda x: (x.get("confidence", 0), x.get("recorded_at", 0)),
                       reverse=True)
        return combined[:limit]

    def get_prompt_improvements(self, agent_role: str) -> Optional[str]:
        """Get synthesized prompt improvements for an agent role."""
        return self._improvements["improvements"].get(agent_role)

    async def _synthesis_loop(self):
        """Periodically synthesize learnings into patterns and prompt improvements."""
        while self._running:
            try:
                await asyncio.sleep(self._synthesis_interval)
                if len(self._knowledge_base["learnings"]) >= 10:
                    await self._synthesize_patterns()
                    await self._generate_prompt_improvements()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"LearningEngine synthesis error: {e}")

    async def _synthesize_patterns(self):
        """Use Claude to synthesize patterns from accumulated learnings."""
        recent = self._knowledge_base["learnings"][-50:]
        if not recent:
            return

        learnings_text = "\n".join(
            f"- [{l.get('category', 'general')}] {l.get('learning', '')}"
            for l in recent
        )

        try:
            response = await self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=2048,
                thinking={"type": "adaptive"},
                messages=[{
                    "role": "user",
                    "content": f"""Analyze these learnings from AI agents running a SaaS company.
Identify 3-5 high-level patterns and actionable insights.

Learnings:
{learnings_text}

Output JSON:
{{
  "patterns": [
    {{
      "pattern": "...",
      "evidence": "...",
      "action": "..."
    }}
  ]
}}"""
                }],
            )

            for block in response.content:
                if hasattr(block, "text"):
                    try:
                        # Extract JSON from response
                        text = block.text
                        start = text.find("{")
                        end = text.rfind("}") + 1
                        if start >= 0 and end > start:
                            data = json.loads(text[start:end])
                            patterns = data.get("patterns", [])
                            self._patterns["patterns"].extend(patterns)
                            self._patterns["last_synthesized"] = time.time()
                            # Keep last 100 patterns
                            if len(self._patterns["patterns"]) > 100:
                                self._patterns["patterns"] = self._patterns["patterns"][-100:]
                            self._save_all()
                            logger.info(f"LearningEngine: synthesized {len(patterns)} patterns")
                    except Exception as e:
                        logger.debug(f"Pattern parsing error: {e}")

        except Exception as e:
            logger.error(f"LearningEngine pattern synthesis failed: {e}")

    async def _generate_prompt_improvements(self):
        """Generate role-specific prompt improvements from patterns."""
        if not self._patterns["patterns"]:
            return

        roles = ["product", "engineering", "sales", "customer_success", "finance", "operations"]
        patterns_text = "\n".join(
            f"- {p.get('pattern', '')}: {p.get('action', '')}"
            for p in self._patterns["patterns"][-20:]
        )

        try:
            response = await self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=3000,
                thinking={"type": "adaptive"},
                messages=[{
                    "role": "user",
                    "content": f"""Based on these patterns from running a SaaS company with AI agents,
generate specific behavioral improvements for each agent role.

Patterns discovered:
{patterns_text}

Generate concise, actionable improvements (2-3 sentences each) for these roles:
{', '.join(roles)}

Output JSON:
{{
  "product": "improvement text...",
  "engineering": "improvement text...",
  "sales": "improvement text...",
  "customer_success": "improvement text...",
  "finance": "improvement text...",
  "operations": "improvement text..."
}}"""
                }],
            )

            for block in response.content:
                if hasattr(block, "text"):
                    try:
                        text = block.text
                        start = text.find("{")
                        end = text.rfind("}") + 1
                        if start >= 0 and end > start:
                            improvements = json.loads(text[start:end])
                            self._improvements["improvements"].update(improvements)
                            self._improvements["last_updated"] = time.time()
                            self._save_all()
                            logger.info("LearningEngine: prompt improvements updated")
                    except Exception as e:
                        logger.debug(f"Improvements parsing error: {e}")

        except Exception as e:
            logger.error(f"LearningEngine improvement generation failed: {e}")

    def get_stats(self) -> dict:
        return {
            "total_learnings": len(self._knowledge_base["learnings"]),
            "patterns_identified": len(self._patterns["patterns"]),
            "roles_with_improvements": len(self._improvements["improvements"]),
            "by_category": {
                k: len(v) for k, v in self._knowledge_base["by_category"].items()
            },
            "last_synthesis": self._patterns.get("last_synthesized"),
        }
