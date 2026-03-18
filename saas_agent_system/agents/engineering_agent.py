"""Engineering Agent — handles development, deployment, and infrastructure."""
from __future__ import annotations
import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

from ..core.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the VP of Engineering AI agent for a SaaS company.

## Your Responsibilities
1. **Technical Architecture** — Design scalable, maintainable systems
2. **Development Planning** — Break down features into tasks, estimate effort
3. **Code Quality** — Define and enforce coding standards, review practices
4. **DevOps & CI/CD** — Manage deployment pipelines, infrastructure
5. **Performance** — Monitor and optimize system performance
6. **Security** — Implement security best practices, vulnerability management
7. **Technical Debt** — Track and systematically reduce tech debt
8. **Incident Response** — Lead incident detection, response, and post-mortems

## Engineering Principles
- Prefer simplicity over complexity
- Automate everything that can be automated
- Measure before optimizing
- Ship early, iterate often
- Security-first mindset
- 12-factor app methodology

## SaaS Engineering Metrics You Track
- Deployment frequency (target: daily)
- Lead time for changes (target: <1 hour)
- Mean time to recovery (target: <30 min)
- Change failure rate (target: <5%)
- System uptime (target: 99.9%)
- API p95 latency (target: <200ms)

You make technical decisions autonomously. Escalate only for decisions with
major architectural impact or costs exceeding $10K/month."""


class EngineeringAgent(BaseAgent):
    """Engineering, development, and infrastructure agent."""

    def __init__(self, shared_memory=None, event_bus=None, learning_engine=None):
        super().__init__(
            agent_id="agent_engineering",
            name="EngineeringAgent (VPE)",
            role="engineering",
            capabilities=[
                "architecture_design", "code_review", "deployment", "incident_response",
                "performance_optimization", "security_audit", "technical_planning",
                "infrastructure_management", "api_design",
            ],
            system_prompt=SYSTEM_PROMPT,
            shared_memory=shared_memory,
            event_bus=event_bus,
            learning_engine=learning_engine,
        )
        self._register_engineering_tools()

    def _register_engineering_tools(self):
        self.register_tool(
            name="create_technical_spec",
            description="Create technical specification for implementing a feature",
            input_schema={
                "type": "object",
                "properties": {
                    "feature": {"type": "string"},
                    "approach": {"type": "string"},
                    "components": {"type": "array", "items": {"type": "string"}},
                    "effort_estimate_days": {"type": "number"},
                    "risks": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["feature", "approach", "effort_estimate_days"],
            },
            handler=self._create_technical_spec,
        )

        self.register_tool(
            name="log_incident",
            description="Log a system incident and trigger response",
            input_schema={
                "type": "object",
                "properties": {
                    "severity": {"type": "string", "enum": ["sev1", "sev2", "sev3", "sev4"]},
                    "description": {"type": "string"},
                    "affected_systems": {"type": "array", "items": {"type": "string"}},
                    "impact": {"type": "string"},
                },
                "required": ["severity", "description", "affected_systems"],
            },
            handler=self._log_incident,
        )

        self.register_tool(
            name="update_engineering_metrics",
            description="Update engineering DORA metrics",
            input_schema={
                "type": "object",
                "properties": {
                    "deploy_frequency": {"type": "number", "description": "Deploys per week"},
                    "lead_time_hours": {"type": "number"},
                    "incident_count": {"type": "number"},
                    "test_coverage_pct": {"type": "number"},
                    "uptime_pct": {"type": "number"},
                },
                "required": [],
            },
            handler=self._update_engineering_metrics,
        )

        self.register_tool(
            name="generate_architecture_doc",
            description="Generate or update system architecture documentation",
            input_schema={
                "type": "object",
                "properties": {
                    "component": {"type": "string"},
                    "description": {"type": "string"},
                    "dependencies": {"type": "array", "items": {"type": "string"}},
                    "data_flows": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["component", "description"],
            },
            handler=self._generate_architecture_doc,
        )

        self.register_tool(
            name="security_audit",
            description="Perform a security audit and report findings",
            input_schema={
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "description": "What to audit"},
                    "findings": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "severity": {"type": "string"},
                                "finding": {"type": "string"},
                                "remediation": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["scope", "findings"],
            },
            handler=self._security_audit,
        )

    def _create_technical_spec(self, feature: str, approach: str,
                                effort_estimate_days: float,
                                components: list = None,
                                risks: list = None) -> dict:
        spec = {
            "feature": feature,
            "approach": approach,
            "components": components or [],
            "effort_estimate_days": effort_estimate_days,
            "risks": risks or [],
            "created_at": time.time(),
        }
        if self.shared_memory:
            specs = self.shared_memory.get_context("tech_specs") or []
            specs.append(spec)
            self.shared_memory.set_context("tech_specs", specs)
        return {"spec_created": True, "feature": feature, "effort_days": effort_estimate_days}

    def _log_incident(self, severity: str, description: str,
                       affected_systems: list, impact: str = "") -> dict:
        incident = {
            "id": f"INC-{int(time.time())}",
            "severity": severity,
            "description": description,
            "affected_systems": affected_systems,
            "impact": impact,
            "status": "open",
            "created_at": time.time(),
        }
        if self.shared_memory:
            incidents = self.shared_memory.get_context("incidents") or []
            incidents.append(incident)
            self.shared_memory.set_context("incidents", incidents)
            current = self.shared_memory.get_metrics()
            self.shared_memory.update_metrics({
                "incident_count": current.get("incident_count", 0) + 1,
            })
        if self.event_bus:
            import asyncio
            asyncio.create_task(self.event_bus.emit("incident_detected", incident))
        logger.warning(f"[EngineeringAgent] Incident logged: {severity} - {description[:80]}")
        return {"incident_id": incident["id"], "logged": True}

    def _update_engineering_metrics(self, **kwargs) -> dict:
        if self.shared_memory:
            self.shared_memory.update_section("engineering", kwargs)
        return {"updated": True, "metrics": kwargs}

    def _generate_architecture_doc(self, component: str, description: str,
                                    dependencies: list = None,
                                    data_flows: list = None) -> dict:
        doc = {
            "component": component,
            "description": description,
            "dependencies": dependencies or [],
            "data_flows": data_flows or [],
            "updated_at": time.time(),
        }
        if self.shared_memory:
            arch = self.shared_memory.get_context("architecture") or {}
            arch[component] = doc
            self.shared_memory.set_context("architecture", arch)
        return {"doc_created": True, "component": component}

    def _security_audit(self, scope: str, findings: list) -> dict:
        audit = {
            "scope": scope,
            "findings": findings,
            "critical_count": sum(1 for f in findings if f.get("severity") == "critical"),
            "audited_at": time.time(),
        }
        if self.shared_memory:
            audits = self.shared_memory.get_context("security_audits") or []
            audits.append(audit)
            self.shared_memory.set_context("security_audits", audits)
        return {"audit_complete": True, "findings_count": len(findings)}
