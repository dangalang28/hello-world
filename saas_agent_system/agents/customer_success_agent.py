"""Customer Success Agent — onboarding, retention, and expansion."""
from __future__ import annotations
import logging
import time
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the VP of Customer Success AI agent for a SaaS company.

## Your Responsibilities
1. **Onboarding** — Design and run customer onboarding programs
2. **Health Scoring** — Monitor customer health and predict churn risk
3. **Support** — Triage and resolve customer issues efficiently
4. **Expansion** — Identify and execute upsell/cross-sell opportunities
5. **Advocacy** — Build customer reference program and case studies
6. **Feedback Loops** — Collect and route product feedback
7. **Renewal Management** — Proactively manage renewals
8. **NPS & CSAT** — Measure and improve customer satisfaction

## Customer Health Framework
Score 0-100 based on:
- Product usage (30%): DAU, feature adoption, integrations
- Business outcomes (30%): ROI achieved, goals met
- Relationship (20%): sponsor engagement, NPS score
- Support health (20%): ticket volume, open issues, escalations

## Intervention Triggers
- Health < 40: Immediate executive outreach
- Health 40-60: CSM check-in + action plan
- Health > 80: Expansion conversation
- No login > 7 days: Re-engagement sequence

You make customer success decisions autonomously. Escalate for:
- Major churn risk (>$50K ARR at risk)
- Customer requiring custom engineering work"""


class CustomerSuccessAgent(BaseAgent):
    """Customer success, support, and retention agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_cs",
            name="CSAgent (VP CS)",
            role="customer_success",
            capabilities=[
                "onboarding", "churn_prediction", "health_scoring", "support_triage",
                "expansion_identification", "nps_management", "renewal_management",
                "customer_advocacy", "feedback_collection",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_cs_tools()

    def _register_cs_tools(self):
        self.register_tool(
            name="create_support_ticket",
            description="Create and triage a customer support ticket",
            input_schema={
                "type": "object",
                "properties": {
                    "customer": {"type": "string"},
                    "issue": {"type": "string"},
                    "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                    "category": {"type": "string"},
                    "resolution": {"type": "string"},
                    "status": {"type": "string", "enum": ["open", "in_progress", "resolved", "closed"]},
                },
                "required": ["customer", "issue", "severity", "category"],
            },
            handler=self._create_support_ticket,
        )

        self.register_tool(
            name="update_customer_health",
            description="Update a customer's health score and risk level",
            input_schema={
                "type": "object",
                "properties": {
                    "customer": {"type": "string"},
                    "health_score": {"type": "number", "description": "0-100"},
                    "churn_risk": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                    "usage_trend": {"type": "string", "enum": ["growing", "stable", "declining"]},
                    "action_items": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["customer", "health_score", "churn_risk"],
            },
            handler=self._update_customer_health,
        )

        self.register_tool(
            name="log_nps_response",
            description="Log an NPS response from a customer",
            input_schema={
                "type": "object",
                "properties": {
                    "customer": {"type": "string"},
                    "score": {"type": "number", "description": "0-10"},
                    "feedback": {"type": "string"},
                    "category": {"type": "string", "enum": ["promoter", "passive", "detractor"]},
                },
                "required": ["customer", "score"],
            },
            handler=self._log_nps_response,
        )

        self.register_tool(
            name="identify_expansion",
            description="Identify an upsell or expansion opportunity",
            input_schema={
                "type": "object",
                "properties": {
                    "customer": {"type": "string"},
                    "opportunity_type": {"type": "string", "enum": ["upsell", "cross_sell", "expansion_seats"]},
                    "potential_arr": {"type": "number"},
                    "rationale": {"type": "string"},
                    "next_step": {"type": "string"},
                },
                "required": ["customer", "opportunity_type", "potential_arr", "rationale"],
            },
            handler=self._identify_expansion,
        )

        self.register_tool(
            name="record_churn",
            description="Record a customer churning",
            input_schema={
                "type": "object",
                "properties": {
                    "customer": {"type": "string"},
                    "arr_lost": {"type": "number"},
                    "reason": {"type": "string"},
                    "could_have_saved": {"type": "boolean"},
                    "lessons_learned": {"type": "string"},
                },
                "required": ["customer", "arr_lost", "reason"],
            },
            handler=self._record_churn,
        )

    def _create_support_ticket(self, customer: str, issue: str, severity: str,
                                 category: str, resolution: str = "",
                                 status: str = "open") -> dict:
        ticket = {
            "id": f"TKT-{int(time.time())}",
            "customer": customer,
            "issue": issue,
            "severity": severity,
            "category": category,
            "resolution": resolution,
            "status": status,
            "created_at": time.time(),
        }
        if self.shared_memory:
            tickets = self.shared_memory.get_context("support_tickets") or []
            tickets.append(ticket)
            self.shared_memory.set_context("support_tickets", tickets)
            metrics = self.shared_memory.get_metrics()
            open_count = metrics.get("tickets_open", 0)
            self.shared_memory.update_metrics({"tickets_open": open_count + 1})
        if self.event_bus:
            import asyncio
            asyncio.create_task(self.event_bus.emit("support_ticket", ticket))
        return {"ticket_id": ticket["id"], "created": True}

    def _update_customer_health(self, customer: str, health_score: float,
                                  churn_risk: str, usage_trend: str = "stable",
                                  action_items: list = None) -> dict:
        health = {
            "customer": customer,
            "health_score": health_score,
            "churn_risk": churn_risk,
            "usage_trend": usage_trend,
            "action_items": action_items or [],
            "updated_at": time.time(),
        }
        if self.shared_memory:
            health_map = self.shared_memory.get_context("customer_health") or {}
            health_map[customer] = health
            self.shared_memory.set_context("customer_health", health_map)
        return {"updated": True, "customer": customer, "health_score": health_score}

    def _log_nps_response(self, customer: str, score: float,
                            feedback: str = "", category: str = None) -> dict:
        if category is None:
            category = "promoter" if score >= 9 else "detractor" if score <= 6 else "passive"
        entry = {
            "customer": customer,
            "score": score,
            "feedback": feedback,
            "category": category,
            "timestamp": time.time(),
        }
        if self.shared_memory:
            nps_data = self.shared_memory.get_context("nps_responses") or []
            nps_data.append(entry)
            self.shared_memory.set_context("nps_responses", nps_data)
            # Recalculate NPS
            if len(nps_data) > 0:
                promoters = sum(1 for r in nps_data if r["score"] >= 9)
                detractors = sum(1 for r in nps_data if r["score"] <= 6)
                nps = ((promoters - detractors) / len(nps_data)) * 100
                self.shared_memory.update_metrics({"nps": round(nps, 1)})
        return {"logged": True, "category": category}

    def _identify_expansion(self, customer: str, opportunity_type: str,
                              potential_arr: float, rationale: str,
                              next_step: str = "") -> dict:
        opp = {
            "customer": customer,
            "type": opportunity_type,
            "potential_arr": potential_arr,
            "rationale": rationale,
            "next_step": next_step,
            "status": "identified",
            "created_at": time.time(),
        }
        if self.shared_memory:
            opps = self.shared_memory.get_context("expansion_opps") or []
            opps.append(opp)
            self.shared_memory.set_context("expansion_opps", opps)
        return {"opportunity_logged": True, "potential_arr": potential_arr}

    def _record_churn(self, customer: str, arr_lost: float, reason: str,
                       could_have_saved: bool = False,
                       lessons_learned: str = "") -> dict:
        churn_event = {
            "customer": customer,
            "arr_lost": arr_lost,
            "reason": reason,
            "could_have_saved": could_have_saved,
            "lessons_learned": lessons_learned,
            "churned_at": time.time(),
        }
        if self.shared_memory:
            churn_log = self.shared_memory.get_context("churn_log") or []
            churn_log.append(churn_event)
            self.shared_memory.set_context("churn_log", churn_log)
            metrics = self.shared_memory.get_metrics()
            new_mrr = max(0, metrics.get("mrr", 0) - arr_lost / 12)
            new_customers = max(0, metrics.get("customers", 0) - 1)
            self.shared_memory.update_metrics({
                "mrr": new_mrr,
                "arr": new_mrr * 12,
                "customers": new_customers,
            })
        if self.event_bus:
            import asyncio
            asyncio.create_task(self.event_bus.emit("customer_churned", churn_event))
        return {"recorded": True, "arr_lost": arr_lost}
