"""Sales & Marketing Agent — lead gen, pipeline management, and revenue growth."""
from __future__ import annotations
import logging
import time
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Chief Revenue Officer (CRO) AI agent for a SaaS company.

## Your Responsibilities
1. **Lead Generation** — Create campaigns, content, and outreach strategies
2. **Pipeline Management** — Track and advance deals through stages
3. **Sales Process** — Develop playbooks, objection handling, and closing strategies
4. **Marketing** — Content strategy, SEO, paid acquisition, community building
5. **Partnerships** — Identify and develop channel/integration partnerships
6. **Revenue Forecasting** — Model pipeline, predict MRR/ARR
7. **ICP Refinement** — Continuously refine ideal customer profile
8. **Competitive Intelligence** — Track competitors, positioning

## Sales Methodology
- MEDDIC for enterprise: Metrics, Economic Buyer, Decision Criteria, Decision Process,
  Identify Pain, Champion
- Product-led growth for SMB: trial → activation → expansion
- Always be qualifying — not every lead is a good fit

## Key Metrics You Own
- MQL → SQL conversion rate
- Sales velocity (deal size × win rate / sales cycle)
- Pipeline coverage (3x quota)
- CAC payback period
- Net Revenue Retention (NRR)

## Outreach Principles
- Personalize at scale
- Lead with value, not product
- Multi-channel: email, LinkedIn, cold call, content, events
- Follow up relentlessly (5+ touchpoints before giving up)

You make revenue decisions autonomously. Escalate only for enterprise deals >$100K ARR
or strategic partnership decisions."""


class SalesAgent(BaseAgent):
    """Sales, marketing, and revenue growth agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_sales",
            name="SalesAgent (CRO)",
            role="sales",
            capabilities=[
                "lead_generation", "pipeline_management", "content_creation",
                "competitive_analysis", "revenue_forecasting", "outreach",
                "partnership_development", "pricing_strategy", "marketing_campaigns",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_sales_tools()

    def _register_sales_tools(self):
        self.register_tool(
            name="add_lead",
            description="Add a new lead to the pipeline",
            input_schema={
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "contact_name": {"type": "string"},
                    "email": {"type": "string"},
                    "source": {"type": "string"},
                    "estimated_arr": {"type": "number"},
                    "icp_fit": {"type": "string", "enum": ["A", "B", "C", "D"]},
                    "notes": {"type": "string"},
                },
                "required": ["company", "source", "icp_fit"],
            },
            handler=self._add_lead,
        )

        self.register_tool(
            name="advance_deal",
            description="Advance a deal to the next pipeline stage",
            input_schema={
                "type": "object",
                "properties": {
                    "deal_id": {"type": "string"},
                    "company": {"type": "string"},
                    "from_stage": {"type": "string"},
                    "to_stage": {"type": "string"},
                    "next_action": {"type": "string"},
                    "close_probability": {"type": "number"},
                },
                "required": ["company", "to_stage"],
            },
            handler=self._advance_deal,
        )

        self.register_tool(
            name="close_deal",
            description="Record a closed deal (won or lost)",
            input_schema={
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "outcome": {"type": "string", "enum": ["won", "lost"]},
                    "arr": {"type": "number"},
                    "reason": {"type": "string"},
                    "competitor_lost_to": {"type": "string"},
                },
                "required": ["company", "outcome", "arr"],
            },
            handler=self._close_deal,
        )

        self.register_tool(
            name="create_campaign",
            description="Create a marketing or outreach campaign",
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": ["email", "content", "paid", "event", "outreach"]},
                    "target_segment": {"type": "string"},
                    "message": {"type": "string"},
                    "expected_leads": {"type": "number"},
                    "budget": {"type": "number"},
                },
                "required": ["name", "type", "target_segment", "message"],
            },
            handler=self._create_campaign,
        )

        self.register_tool(
            name="update_revenue_forecast",
            description="Update MRR/ARR forecast based on pipeline",
            input_schema={
                "type": "object",
                "properties": {
                    "current_mrr": {"type": "number"},
                    "pipeline_value": {"type": "number"},
                    "expected_close_rate": {"type": "number"},
                    "forecast_mrr": {"type": "number"},
                    "forecast_month": {"type": "string"},
                },
                "required": ["current_mrr", "forecast_mrr"],
            },
            handler=self._update_revenue_forecast,
        )

    def _add_lead(self, company: str, source: str, icp_fit: str,
                   contact_name: str = "", email: str = "",
                   estimated_arr: float = 0, notes: str = "") -> dict:
        lead = {
            "id": f"LEAD-{int(time.time())}",
            "company": company,
            "contact_name": contact_name,
            "email": email,
            "source": source,
            "estimated_arr": estimated_arr,
            "icp_fit": icp_fit,
            "notes": notes,
            "stage": "lead",
            "created_at": time.time(),
        }
        if self.shared_memory:
            leads = self.shared_memory.get_context("leads") or []
            leads.append(lead)
            self.shared_memory.set_context("leads", leads)
            metrics = self.shared_memory.get_metrics()
            self.shared_memory.update_metrics({"leads": metrics.get("leads", 0) + 1})
            pipeline = {"leads": metrics.get("leads", 0) + 1}
            self.shared_memory.update_section("pipeline", pipeline)
        if self.event_bus:
            import asyncio
            asyncio.create_task(self.event_bus.emit("lead_captured", lead))
        return {"lead_id": lead["id"], "added": True}

    def _advance_deal(self, company: str, to_stage: str,
                       deal_id: str = "", from_stage: str = "",
                       next_action: str = "", close_probability: float = 0.5) -> dict:
        update = {
            "company": company,
            "stage": to_stage,
            "close_probability": close_probability,
            "next_action": next_action,
            "updated_at": time.time(),
        }
        if self.shared_memory:
            deals = self.shared_memory.get_context("deals") or []
            deals.append(update)
            self.shared_memory.set_context("deals", deals)
        return {"advanced": True, "company": company, "stage": to_stage}

    def _close_deal(self, company: str, outcome: str, arr: float,
                     reason: str = "", competitor_lost_to: str = "") -> dict:
        deal = {
            "company": company,
            "outcome": outcome,
            "arr": arr,
            "reason": reason,
            "closed_at": time.time(),
        }
        if self.shared_memory:
            metrics = self.shared_memory.get_metrics()
            if outcome == "won":
                new_mrr = metrics.get("mrr", 0) + arr / 12
                new_customers = metrics.get("customers", 0) + 1
                self.shared_memory.update_metrics({
                    "mrr": new_mrr,
                    "arr": new_mrr * 12,
                    "customers": new_customers,
                })
        if self.event_bus:
            import asyncio
            asyncio.create_task(self.event_bus.emit("deal_closed", deal))
        return {"closed": True, "outcome": outcome, "arr": arr}

    def _create_campaign(self, name: str, type: str, target_segment: str,
                          message: str, expected_leads: float = 0,
                          budget: float = 0) -> dict:
        campaign = {
            "name": name,
            "type": type,
            "target_segment": target_segment,
            "message": message,
            "expected_leads": expected_leads,
            "budget": budget,
            "status": "active",
            "created_at": time.time(),
        }
        if self.shared_memory:
            campaigns = self.shared_memory.get_context("campaigns") or []
            campaigns.append(campaign)
            self.shared_memory.set_context("campaigns", campaigns)
        return {"campaign_created": True, "name": name, "type": type}

    def _update_revenue_forecast(self, current_mrr: float, forecast_mrr: float,
                                   pipeline_value: float = 0,
                                   expected_close_rate: float = 0.2,
                                   forecast_month: str = "") -> dict:
        forecast = {
            "current_mrr": current_mrr,
            "pipeline_value": pipeline_value,
            "expected_close_rate": expected_close_rate,
            "forecast_mrr": forecast_mrr,
            "forecast_month": forecast_month,
            "created_at": time.time(),
        }
        if self.shared_memory:
            self.shared_memory.set_context("revenue_forecast", forecast)
        return {"forecast_updated": True, "forecast_mrr": forecast_mrr}
