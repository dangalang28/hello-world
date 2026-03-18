"""Operations Agent — HR, legal, vendor management, and company processes."""
from __future__ import annotations
import logging
import time
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the COO / Head of Operations AI agent for a SaaS company.

## Your Responsibilities
1. **Process Design** — Create and optimize company processes and playbooks
2. **Hiring** — Draft job descriptions, evaluate candidates, build hiring pipelines
3. **Vendor Management** — Manage SaaS tools, negotiate contracts, optimize spend
4. **Legal & Compliance** — Track legal requirements, SOC2, GDPR, contracts
5. **Company Culture** — Define values, rituals, and culture programs
6. **OKR Tracking** — Facilitate company-wide OKR process
7. **Board Management** — Prepare board decks and materials
8. **Knowledge Management** — Maintain company wiki and documentation

## Operations Principles
- Document everything — if it's not written down, it doesn't exist
- Automate before hiring
- Process debt is as dangerous as technical debt
- Culture is your competitive moat

## Key Metrics You Track
- Time-to-hire (target: <45 days)
- Employee NPS / eNPS (target: >40)
- Process compliance rate
- Vendor cost as % of ARR (target: <15%)
- Documentation coverage

You make operational decisions autonomously. Escalate for:
- Hiring decisions for senior roles (VP+)
- Legal matters with >$50K exposure
- Strategic process changes affecting entire company"""


class OperationsAgent(BaseAgent):
    """Operations, HR, legal, and process management agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_operations",
            name="OpsAgent (COO)",
            role="operations",
            capabilities=[
                "process_design", "hiring", "vendor_management", "legal_compliance",
                "culture_building", "okr_facilitation", "knowledge_management",
                "board_reporting", "tool_evaluation",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_ops_tools()

    def _register_ops_tools(self):
        self.register_tool(
            name="create_process",
            description="Document a new company process or playbook",
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "department": {"type": "string"},
                    "description": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "string"}},
                    "owner": {"type": "string"},
                    "tools_used": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "department", "steps", "owner"],
            },
            handler=self._create_process,
        )

        self.register_tool(
            name="open_role",
            description="Open a new hiring role",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "department": {"type": "string"},
                    "level": {"type": "string"},
                    "responsibilities": {"type": "array", "items": {"type": "string"}},
                    "requirements": {"type": "array", "items": {"type": "string"}},
                    "salary_range": {"type": "string"},
                    "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                },
                "required": ["title", "department", "level", "priority"],
            },
            handler=self._open_role,
        )

        self.register_tool(
            name="manage_vendor",
            description="Add or update a vendor/tool in the tech stack",
            input_schema={
                "type": "object",
                "properties": {
                    "vendor_name": {"type": "string"},
                    "category": {"type": "string"},
                    "monthly_cost": {"type": "number"},
                    "users": {"type": "number"},
                    "renewal_date": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "evaluating", "cancelled"]},
                    "roi_assessment": {"type": "string"},
                },
                "required": ["vendor_name", "category", "monthly_cost", "status"],
            },
            handler=self._manage_vendor,
        )

        self.register_tool(
            name="log_compliance_item",
            description="Log a compliance requirement or status",
            input_schema={
                "type": "object",
                "properties": {
                    "framework": {"type": "string", "description": "SOC2/GDPR/HIPAA/etc"},
                    "requirement": {"type": "string"},
                    "status": {"type": "string", "enum": ["compliant", "in_progress", "not_started", "na"]},
                    "owner": {"type": "string"},
                    "due_date": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["framework", "requirement", "status"],
            },
            handler=self._log_compliance_item,
        )

        self.register_tool(
            name="update_company_okrs",
            description="Update company-level OKRs and progress",
            input_schema={
                "type": "object",
                "properties": {
                    "quarter": {"type": "string"},
                    "objectives": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "objective": {"type": "string"},
                                "key_results": {"type": "array", "items": {"type": "string"}},
                                "progress_pct": {"type": "number"},
                                "owner": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["quarter", "objectives"],
            },
            handler=self._update_company_okrs,
        )

    def _create_process(self, name: str, department: str, steps: list,
                         owner: str, description: str = "",
                         tools_used: list = None) -> dict:
        process = {
            "name": name,
            "department": department,
            "description": description,
            "steps": steps,
            "owner": owner,
            "tools_used": tools_used or [],
            "version": "1.0",
            "created_at": time.time(),
        }
        if self.shared_memory:
            processes = self.shared_memory.get_context("processes") or {}
            processes[name] = process
            self.shared_memory.set_context("processes", processes)
        return {"process_created": True, "name": name, "steps": len(steps)}

    def _open_role(self, title: str, department: str, level: str,
                    priority: str, responsibilities: list = None,
                    requirements: list = None, salary_range: str = "") -> dict:
        role = {
            "id": f"ROLE-{int(time.time())}",
            "title": title,
            "department": department,
            "level": level,
            "priority": priority,
            "responsibilities": responsibilities or [],
            "requirements": requirements or [],
            "salary_range": salary_range,
            "status": "open",
            "created_at": time.time(),
        }
        if self.shared_memory:
            roles = self.shared_memory.get_context("open_roles") or []
            roles.append(role)
            self.shared_memory.set_context("open_roles", roles)
        return {"role_id": role["id"], "opened": True, "title": title}

    def _manage_vendor(self, vendor_name: str, category: str,
                        monthly_cost: float, status: str,
                        users: float = 0, renewal_date: str = "",
                        roi_assessment: str = "") -> dict:
        vendor = {
            "name": vendor_name,
            "category": category,
            "monthly_cost": monthly_cost,
            "annual_cost": monthly_cost * 12,
            "users": users,
            "renewal_date": renewal_date,
            "status": status,
            "roi_assessment": roi_assessment,
            "updated_at": time.time(),
        }
        if self.shared_memory:
            vendors = self.shared_memory.get_context("vendors") or {}
            vendors[vendor_name] = vendor
            self.shared_memory.set_context("vendors", vendors)
        return {"vendor_updated": True, "name": vendor_name, "monthly_cost": monthly_cost}

    def _log_compliance_item(self, framework: str, requirement: str,
                               status: str, owner: str = "",
                               due_date: str = "", notes: str = "") -> dict:
        item = {
            "framework": framework,
            "requirement": requirement,
            "status": status,
            "owner": owner,
            "due_date": due_date,
            "notes": notes,
            "updated_at": time.time(),
        }
        if self.shared_memory:
            compliance = self.shared_memory.get_context("compliance") or {}
            key = f"{framework}:{requirement[:50]}"
            compliance[key] = item
            self.shared_memory.set_context("compliance", compliance)
        return {"logged": True, "framework": framework, "status": status}

    def _update_company_okrs(self, quarter: str, objectives: list) -> dict:
        okr_data = {
            "quarter": quarter,
            "objectives": objectives,
            "total_objectives": len(objectives),
            "avg_progress": sum(o.get("progress_pct", 0) for o in objectives) / max(len(objectives), 1),
            "updated_at": time.time(),
        }
        if self.shared_memory:
            self.shared_memory.set_context(f"okrs_{quarter}", okr_data)
        return {"okrs_updated": True, "quarter": quarter, "objectives": len(objectives)}
