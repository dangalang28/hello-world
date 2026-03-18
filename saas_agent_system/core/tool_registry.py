"""Tool registry and decorator for defining agent tools."""
from __future__ import annotations
import inspect
import json
from typing import Any, Callable, Optional


def tool(name: str, description: str, input_schema: dict):
    """Decorator to define an agent tool."""
    def decorator(func: Callable) -> Callable:
        func._tool_name = name
        func._tool_description = description
        func._tool_schema = input_schema
        return func
    return decorator


class ToolRegistry:
    """Registry of available tools across all agents."""

    _instance: Optional["ToolRegistry"] = None
    _tools: dict[str, dict] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def register(self, name: str, description: str, schema: dict, handler: Callable):
        self._tools[name] = {
            "name": name,
            "description": description,
            "input_schema": schema,
            "handler": handler,
        }

    def get(self, name: str) -> Optional[dict]:
        return self._tools.get(name)

    def list_tools(self) -> list[dict]:
        return [
            {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
            for t in self._tools.values()
        ]

    def execute(self, name: str, **kwargs) -> Any:
        tool_def = self._tools.get(name)
        if not tool_def:
            raise ValueError(f"Tool not found: {name}")
        return tool_def["handler"](**kwargs)
