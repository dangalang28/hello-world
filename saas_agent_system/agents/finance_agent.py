"""Finance Agent — financial modeling, reporting, and runway management."""
from __future__ import annotations
import logging
import time
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the CFO AI agent for a SaaS company.

## Your Responsibilities
1. **Financial Modeling** — MRR/ARR models, unit economics, scenario planning
2. **Runway Management** — Track burn rate and extend runway
3. **Budget Management** — Allocate budget across departments
4. **SaaS Metrics** — LTV, CAC, payback period, Rule of 40
5. **Revenue Recognition** — Ensure proper rev rec practices
6. **Cost Optimization** — Identify and reduce unnecessary spend
7. **Fundraising Support** — Prepare financial data for investors
8. **Compliance** — Ensure financial compliance and proper bookkeeping

## Key SaaS Financial Metrics
- MRR Growth Rate (target: >15% MoM early stage)
- Net Revenue Retention (target: >110%)
- Gross Margin (target: >70%)
- CAC:LTV Ratio (target: >3:1)
- Rule of 40 (growth% + profit% > 40)
- Burn Multiple (target: <1 for efficient growth)

## Financial Principles
- Default alive over default dead
- Unit economics positive before scaling
- 18+ months runway always
- Every dollar spent must have positive ROI

You make financial decisions autonomously up to $10K. Escalate for:
- Decisions >$10K single purchase
- Fundraising decisions
- Major compensation changes"""


class FinanceAgent(BaseAgent):
    """Financial management and reporting agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_finance",
            name="FinanceAgent (CFO)",
            role="finance",
            capabilities=[
                "financial_modeling", "budget_management", "runway_tracking",
                "saas_metrics", "cost_optimization", "revenue_recognition",
                "investor_reporting", "compliance",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_finance_tools()

    def _register_finance_tools(self):
        self.register_tool(
            name="update_financials",
            description="Update key financial metrics",
            input_schema={
                "type": "object",
                "properties": {
                    "mrr": {"type": "number"},
                    "arr": {"type": "number"},
                    "burn_rate": {"type": "number", "description": "Monthly burn in USD"},
                    "cash_on_hand": {"type": "number"},
                    "runway_months": {"type": "number"},
                    "gross_margin": {"type": "number"},
                    "cac": {"type": "number"},
                    "ltv": {"type": "number"},
                },
                "required": [],
            },
            handler=self._update_financials,
        )

        self.register_tool(
            name="create_budget",
            description="Create or update department budget",
            input_schema={
                "type": "object",
                "properties": {
                    "period": {"type": "string"},
                    "departments": {
                        "type": "object",
                        "description": "Department name → budget amount",
                    },
                    "total_budget": {"type": "number"},
                    "notes": {"type": "string"},
                },
                "required": ["period", "departments", "total_budget"],
            },
            handler=self._create_budget,
        )

        self.register_tool(
            name="log_expense",
            description="Log a company expense",
            input_schema={
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "amount": {"type": "number"},
                    "category": {"type": "string"},
                    "department": {"type": "string"},
                    "recurring": {"type": "boolean"},
                    "roi_justification": {"type": "string"},
                },
                "required": ["description", "amount", "category", "department"],
            },
            handler=self._log_expense,
        )

        self.register_tool(
            name="generate_financial_report",
            description="Generate a financial report",
            input_schema={
                "type": "object",
                "properties": {
                    "period": {"type": "string"},
                    "report_type": {
                        "type": "string",
                        "enum": ["monthly", "quarterly", "investor", "board"],
                    },
                    "highlights": {"type": "array", "items": {"type": "string"}},
                    "concerns": {"type": "array", "items": {"type": "string"}},
                    "recommendations": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["period", "report_type"],
            },
            handler=self._generate_financial_report,
        )

        self.register_tool(
            name="calculate_unit_economics",
            description="Calculate and update unit economics",
            input_schema={
                "type": "object",
                "properties": {
                    "total_sales_marketing_spend": {"type": "number"},
                    "new_customers": {"type": "number"},
                    "avg_contract_value": {"type": "number"},
                    "gross_margin_pct": {"type": "number"},
                    "avg_customer_lifespan_months": {"type": "number"},
                },
                "required": ["total_sales_marketing_spend", "new_customers", "avg_contract_value"],
            },
            handler=self._calculate_unit_economics,
        )

    def _update_financials(self, **kwargs) -> dict:
        if self.shared_memory:
            self.shared_memory.update_metrics(kwargs)
        if self.event_bus and "mrr" in kwargs:
            import asyncio
            asyncio.create_task(self.event_bus.emit("revenue_updated", kwargs))
        return {"updated": True, "fields": list(kwargs.keys())}

    def _create_budget(self, period: str, departments: dict,
                        total_budget: float, notes: str = "") -> dict:
        budget = {
            "period": period,
            "departments": departments,
            "total": total_budget,
            "notes": notes,
            "created_at": time.time(),
        }
        if self.shared_memory:
            budgets = self.shared_memory.get_context("budgets") or []
            budgets.append(budget)
            self.shared_memory.set_context("budgets", budgets)
        return {"budget_created": True, "period": period, "total": total_budget}

    def _log_expense(self, description: str, amount: float, category: str,
                      department: str, recurring: bool = False,
                      roi_justification: str = "") -> dict:
        expense = {
            "id": f"EXP-{int(time.time())}",
            "description": description,
            "amount": amount,
            "category": category,
            "department": department,
            "recurring": recurring,
            "roi_justification": roi_justification,
            "logged_at": time.time(),
        }
        if self.shared_memory:
            expenses = self.shared_memory.get_context("expenses") or []
            expenses.append(expense)
            self.shared_memory.set_context("expenses", expenses)
        return {"expense_id": expense["id"], "logged": True}

    def _generate_financial_report(self, period: str, report_type: str,
                                    highlights: list = None, concerns: list = None,
                                    recommendations: list = None) -> dict:
        metrics = {}
        if self.shared_memory:
            metrics = self.shared_memory.get_metrics()
        report = {
            "period": period,
            "type": report_type,
            "metrics_snapshot": metrics,
            "highlights": highlights or [],
            "concerns": concerns or [],
            "recommendations": recommendations or [],
            "generated_at": time.time(),
        }
        if self.shared_memory:
            reports = self.shared_memory.get_context("financial_reports") or []
            reports.append(report)
            self.shared_memory.set_context("financial_reports", reports)
        return {"report_generated": True, "type": report_type, "period": period}

    def _calculate_unit_economics(self, total_sales_marketing_spend: float,
                                    new_customers: float, avg_contract_value: float,
                                    gross_margin_pct: float = 0.70,
                                    avg_customer_lifespan_months: float = 24) -> dict:
        cac = total_sales_marketing_spend / max(new_customers, 1)
        ltv = avg_contract_value * gross_margin_pct * (avg_customer_lifespan_months / 12)
        ltv_cac = ltv / max(cac, 1)
        payback_months = cac / (avg_contract_value * gross_margin_pct / 12) if avg_contract_value > 0 else 0

        unit_econ = {
            "cac": round(cac, 2),
            "ltv": round(ltv, 2),
            "ltv_cac_ratio": round(ltv_cac, 2),
            "payback_months": round(payback_months, 1),
            "calculated_at": time.time(),
        }
        if self.shared_memory:
            self.shared_memory.update_metrics({"cac": cac, "ltv": ltv})
            self.shared_memory.set_context("unit_economics", unit_econ)
        return unit_econ
