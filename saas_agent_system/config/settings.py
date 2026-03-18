"""System configuration and settings."""
from __future__ import annotations
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Settings:
    # Anthropic
    anthropic_api_key: str = field(
        default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", "")
    )
    model: str = "claude-opus-4-6"

    # Orchestrator
    cycle_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("CYCLE_INTERVAL", "60"))
    )
    max_concurrent_tasks: int = 10

    # Agent behavior
    agent_max_retries: int = 3
    agent_timeout_seconds: float = 120.0
    thinking_enabled: bool = True

    # Health monitor
    health_check_interval: int = 30
    max_inactive_seconds: int = 600
    min_success_rate: float = 0.5

    # Learning engine
    synthesis_interval_seconds: int = 300
    max_learnings: int = 2000
    min_confidence_threshold: float = 0.5

    # API
    api_host: str = field(
        default_factory=lambda: os.environ.get("API_HOST", "0.0.0.0")
    )
    api_port: int = field(
        default_factory=lambda: int(os.environ.get("API_PORT", "8000"))
    )

    # Data paths
    data_dir: Path = field(
        default_factory=lambda: Path(__file__).parent.parent / "data"
    )

    # Company config
    company_name: str = field(
        default_factory=lambda: os.environ.get("COMPANY_NAME", "SaaS Co")
    )
    company_stage: str = field(
        default_factory=lambda: os.environ.get("COMPANY_STAGE", "early")
    )

    def validate(self) -> list[str]:
        """Validate settings and return list of issues."""
        issues = []
        if not self.anthropic_api_key:
            issues.append("ANTHROPIC_API_KEY environment variable not set")
        return issues

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "cycle_interval_seconds": self.cycle_interval_seconds,
            "max_concurrent_tasks": self.max_concurrent_tasks,
            "company_name": self.company_name,
            "company_stage": self.company_stage,
            "api_host": self.api_host,
            "api_port": self.api_port,
        }


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
