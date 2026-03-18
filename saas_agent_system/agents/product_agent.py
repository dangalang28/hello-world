"""Product Agent — manages roadmap, features, and product strategy."""
from __future__ import annotations
import json
import logging
import time
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Chief Product Officer (CPO) AI agent for a SaaS company.

## Your Responsibilities
1. **Product Strategy** — Define and evolve the product roadmap based on market signals
2. **Feature Prioritization** — Score features using RICE/ICE frameworks
3. **Market Analysis** — Analyze competitor landscape and identify opportunities
4. **User Research** — Synthesize customer feedback into product insights
5. **Product-Market Fit** — Track and improve PMF signals
6. **Go-to-Market** — Define ICP, positioning, and messaging
7. **OKR Management** — Set and track product OKRs

## Decision Framework
- Always prioritize based on: customer impact × revenue potential / effort
- Use data over opinions
- Think in first principles
- Default to shipping fast and iterating

## Output Format
Always structure your output with:
- Executive Summary
- Key Decisions Made
- Action Items (with owner and deadline)
- Success Metrics
- Risks and Mitigations

You operate autonomously and make product decisions. Escalate only for strategic pivots,
significant budget requirements (>$50K), or when fundamentally blocked."""


class ProductAgent(BaseAgent):
    """Product strategy and roadmap management agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_product",
            name="ProductAgent (CPO)",
            role="product",
            capabilities=[
                "roadmap_planning", "feature_prioritization", "market_analysis",
                "user_research", "okr_management", "pricing_strategy",
                "competitive_intelligence", "product_metrics",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_product_tools()

    def _register_product_tools(self):
        self.register_tool(
            name="update_roadmap",
            description="Update the product roadmap with new features or reprioritization",
            input_schema={
                "type": "object",
                "properties": {
                    "features": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
                                "effort_days": {"type": "number"},
                                "impact_score": {"type": "number"},
                                "quarter": {"type": "string"},
                            },
                        },
                    },
                    "rationale": {"type": "string"},
                },
                "required": ["features", "rationale"],
            },
            handler=self._update_roadmap,
        )

        self.register_tool(
            name="analyze_metrics",
            description="Analyze product metrics and generate insights",
            input_schema={
                "type": "object",
                "properties": {
                    "metric_type": {
                        "type": "string",
                        "enum": ["engagement", "retention", "activation", "nps", "pmf"],
                    },
                    "timeframe": {"type": "string"},
                },
                "required": ["metric_type"],
            },
            handler=self._analyze_metrics,
        )

        self.register_tool(
            name="create_spec",
            description="Create a product specification document for a feature",
            input_schema={
                "type": "object",
                "properties": {
                    "feature_name": {"type": "string"},
                    "user_story": {"type": "string"},
                    "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
                    "technical_notes": {"type": "string"},
                },
                "required": ["feature_name", "user_story", "acceptance_criteria"],
            },
            handler=self._create_spec,
        )

        self.register_tool(
            name="set_product_goals",
            description="Set product OKRs and success metrics",
            input_schema={
                "type": "object",
                "properties": {
                    "period": {"type": "string"},
                    "objectives": {"type": "array", "items": {"type": "string"}},
                    "key_results": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["period", "objectives", "key_results"],
            },
            handler=self._set_goals,
        )

    def _update_roadmap(self, features: list, rationale: str) -> dict:
        if self.shared_memory:
            existing = self.shared_memory.get_context("roadmap") or {"features": []}
            existing["features"].extend(features)
            existing["last_updated"] = time.time()
            existing["rationale"] = rationale
            self.shared_memory.set_context("roadmap", existing)
        logger.info(f"[ProductAgent] Roadmap updated: {len(features)} features")
        return {"updated": True, "total_features": len(features)}

    def _analyze_metrics(self, metric_type: str, timeframe: str = "last_30_days") -> dict:
        metrics = {}
        if self.shared_memory:
            metrics = self.shared_memory.get_metrics()
        # Return simulated analysis with real metrics
        return {
            "metric_type": metric_type,
            "timeframe": timeframe,
            "current_metrics": metrics,
            "status": "analysis_ready",
        }

    def _create_spec(self, feature_name: str, user_story: str,
                     acceptance_criteria: list, technical_notes: str = "") -> dict:
        spec = {
            "feature": feature_name,
            "user_story": user_story,
            "acceptance_criteria": acceptance_criteria,
            "technical_notes": technical_notes,
            "created_at": time.time(),
            "status": "draft",
        }
        if self.shared_memory:
            specs = self.shared_memory.get_context("product_specs") or []
            specs.append(spec)
            self.shared_memory.set_context("product_specs", specs)
        return {"spec_created": True, "feature": feature_name}

    def _set_goals(self, period: str, objectives: list, key_results: list) -> dict:
        if self.shared_memory:
            self.shared_memory.set_goals(period, objectives)
        return {"goals_set": True, "period": period, "count": len(objectives)}
