"""
CLI interface for the SaaS AI Agent System.
Usage: python -m saas_agent_system.cli.main [command]
"""
from __future__ import annotations
import asyncio
import json
import logging
import sys
from pathlib import Path

import click

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent.parent / "data" / "logs" / "system.log"),
    ],
)

logger = logging.getLogger(__name__)


@click.group()
def cli():
    """SaaS AI Agent System — self-healing, self-learning AI agents."""
    pass


@cli.command()
@click.option("--cycle-interval", default=60, help="Orchestration cycle interval (seconds)")
@click.option("--with-api", is_flag=True, default=False, help="Also start the API server")
@click.option("--api-port", default=8000, help="API server port")
@click.option("--log-level", default="INFO", help="Log level")
def run(cycle_interval: int, with_api: bool, api_port: int, log_level: str):
    """Start the full SaaS AI agent system."""
    logging.getLogger().setLevel(getattr(logging, log_level.upper(), logging.INFO))

    click.echo("🚀 Starting SaaS AI Agent System...")
    click.echo(f"   Cycle interval: {cycle_interval}s")
    click.echo(f"   API server: {'enabled' if with_api else 'disabled'}")

    asyncio.run(_run_system(cycle_interval, with_api, api_port))


async def _run_system(cycle_interval: int, with_api: bool, api_port: int):
    from ..orchestrator import SaaSOrchestrator
    from ..api.app import create_app, set_orchestrator

    orch = SaaSOrchestrator(config={"cycle_interval_seconds": cycle_interval})
    await orch.start()

    if with_api:
        import uvicorn
        set_orchestrator(orch)
        app = create_app()
        config = uvicorn.Config(app, host="0.0.0.0", port=api_port, log_level="warning")
        server = uvicorn.Server(config)
        click.echo(f"   API server: http://localhost:{api_port}")
        click.echo("\n✅ System running. Press Ctrl+C to stop.\n")
        try:
            await server.serve()
        except KeyboardInterrupt:
            pass
    else:
        click.echo("\n✅ System running. Press Ctrl+C to stop.\n")
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            pass

    await orch.stop()
    click.echo("\n👋 System stopped cleanly.")


@cli.command()
@click.option("--api-url", default="http://localhost:8000", help="API URL")
def status(api_url: str):
    """Show current system status."""
    asyncio.run(_show_status(api_url))


async def _show_status(api_url: str):
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{api_url}/status", timeout=5)
            data = r.json()

            click.echo("\n=== SaaS AI Agent System Status ===\n")

            # Metrics
            metrics = data.get("metrics", {})
            click.echo("📊 Business Metrics:")
            click.echo(f"   MRR:       ${metrics.get('mrr', 0):,.2f}")
            click.echo(f"   ARR:       ${metrics.get('arr', 0):,.2f}")
            click.echo(f"   Customers: {metrics.get('customers', 0)}")
            click.echo(f"   NPS:       {metrics.get('nps', 0)}")
            click.echo(f"   Runway:    {metrics.get('runway_months', 0)} months")

            # Orchestrator
            orch = data.get("orchestrator", {})
            click.echo(f"\n🤖 Orchestrator:")
            click.echo(f"   Cycles:    {orch.get('cycle_count', 0)}")
            click.echo(f"   Queue:     {orch.get('queue_size', 0)} pending tasks")
            click.echo(f"   Results:   {orch.get('total_results', 0)} completed")

            # Agents
            click.echo("\n👥 Agent Fleet:")
            for name, health in data.get("agents", {}).items():
                status_icon = {"idle": "💚", "working": "🔵", "healing": "🟡", "failed": "🔴"}.get(
                    health.get("status"), "⚪"
                )
                click.echo(
                    f"   {status_icon} {health.get('name', name)}: "
                    f"{health.get('status')} | "
                    f"✓ {health.get('tasks_completed', 0)} "
                    f"✗ {health.get('tasks_failed', 0)}"
                )

            # Learning
            learning = data.get("learning", {})
            click.echo(f"\n🧠 Learning Engine:")
            click.echo(f"   Learnings: {learning.get('total_learnings', 0)}")
            click.echo(f"   Patterns:  {learning.get('patterns_identified', 0)}")
            click.echo(f"   Improved roles: {learning.get('roles_with_improvements', 0)}")
            click.echo()

    except Exception as e:
        click.echo(f"❌ Error connecting to API: {e}")
        click.echo(f"   Make sure system is running: python -m saas_agent_system.cli.main run --with-api")


@cli.command()
@click.argument("agent")
@click.argument("task_type")
@click.argument("description")
@click.option("--payload", default="{}", help="JSON payload")
@click.option("--priority", default=3, help="Priority 1-10 (1=highest)")
@click.option("--api-url", default="http://localhost:8000", help="API URL")
def dispatch(agent: str, task_type: str, description: str,
             payload: str, priority: int, api_url: str):
    """Dispatch a task to an agent."""
    asyncio.run(_dispatch_task(agent, task_type, description, payload, priority, api_url))


async def _dispatch_task(agent: str, task_type: str, description: str,
                          payload_str: str, priority: int, api_url: str):
    try:
        payload = json.loads(payload_str)
    except json.JSONDecodeError:
        click.echo(f"❌ Invalid JSON payload: {payload_str}")
        return

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            click.echo(f"📤 Dispatching task to {agent} agent...")
            r = await client.post(
                f"{api_url}/tasks/dispatch/sync",
                json={
                    "agent": agent,
                    "task_type": task_type,
                    "description": description,
                    "payload": payload,
                    "priority": priority,
                },
                timeout=300,
            )
            result = r.json()
            if result.get("success"):
                click.echo(f"✅ Task completed in {result.get('duration', 0):.1f}s")
                click.echo(f"\n📋 Output:\n{result.get('output', 'No output')}")
            else:
                click.echo(f"❌ Task failed: {result.get('error', 'Unknown error')}")
    except Exception as e:
        click.echo(f"❌ Error: {e}")


@cli.command()
@click.option("--api-url", default="http://localhost:8000", help="API URL")
def dashboard(api_url: str):
    """Show a live dashboard (updates every 5 seconds)."""
    asyncio.run(_live_dashboard(api_url))


async def _live_dashboard(api_url: str):
    import httpx
    import os

    click.echo("📊 Live Dashboard (Ctrl+C to stop)\n")
    try:
        while True:
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get(f"{api_url}/status", timeout=5)
                    data = r.json()

                os.system("clear" if os.name == "posix" else "cls")
                metrics = data.get("metrics", {})
                orch = data.get("orchestrator", {})
                learning = data.get("learning", {})

                click.echo("╔══════════════════════════════════════════════╗")
                click.echo("║       SaaS AI Agent System — Dashboard       ║")
                click.echo("╠══════════════════════════════════════════════╣")
                click.echo(f"║  MRR: ${metrics.get('mrr', 0):>10,.2f}  │  ARR: ${metrics.get('arr', 0):>10,.2f}  ║")
                click.echo(f"║  Customers: {metrics.get('customers', 0):>5}  │  NPS: {metrics.get('nps', 0):>6.1f}  │  Runway: {metrics.get('runway_months', 0):>3}mo  ║")
                click.echo("╠══════════════════════════════════════════════╣")
                click.echo(f"║  Cycles: {orch.get('cycle_count', 0):>4}  │  Queue: {orch.get('queue_size', 0):>3}  │  Done: {orch.get('total_results', 0):>5}  ║")
                click.echo(f"║  Learnings: {learning.get('total_learnings', 0):>4}  │  Patterns: {learning.get('patterns_identified', 0):>3}  │  Improved: {learning.get('roles_with_improvements', 0):>2}  ║")
                click.echo("╠══════════════════════════════════════════════╣")
                click.echo("║  Agent Fleet:                                ║")
                for name, health in data.get("agents", {}).items():
                    icon = {"idle": "💚", "working": "🔵", "healing": "🟡", "failed": "🔴"}.get(
                        health.get("status"), "⚪"
                    )
                    click.echo(f"║  {icon} {health.get('name', name)[:30]:<30}  ║")
                click.echo("╚══════════════════════════════════════════════╝")

            except Exception as e:
                click.echo(f"Connection error: {e}")

            await asyncio.sleep(5)
    except KeyboardInterrupt:
        click.echo("\n\n👋 Dashboard closed.")


@cli.command()
@click.option("--api-url", default="http://localhost:8000", help="API URL")
def events(api_url: str):
    """Show recent system events."""
    asyncio.run(_show_events(api_url))


async def _show_events(api_url: str):
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{api_url}/events?limit=20", timeout=5)
            events = r.json()
            click.echo(f"\n📡 Recent Events ({len(events)} shown):\n")
            import datetime
            for ev in events:
                ts = datetime.datetime.fromtimestamp(ev.get("timestamp", 0))
                click.echo(f"  [{ts.strftime('%H:%M:%S')}] {ev['type']:<35} {json.dumps(ev.get('data', {}))[:80]}")
    except Exception as e:
        click.echo(f"❌ Error: {e}")


@cli.command()
def demo():
    """Run a quick demo of the system without API keys."""
    click.echo("🎭 Demo mode — showing system structure\n")
    click.echo("System Architecture:")
    click.echo("├── Orchestrator (CEO) — coordinates all agents")
    click.echo("├── Agents")
    click.echo("│   ├── ProductAgent (CPO) — roadmap, features, PMF")
    click.echo("│   ├── EngineeringAgent (VPE) — dev, deployment, incidents")
    click.echo("│   ├── SalesAgent (CRO) — pipeline, revenue, marketing")
    click.echo("│   ├── CustomerSuccessAgent (VP CS) — retention, support")
    click.echo("│   ├── FinanceAgent (CFO) — financials, runway, metrics")
    click.echo("│   └── OperationsAgent (COO) — processes, hiring, legal")
    click.echo("├── Core Infrastructure")
    click.echo("│   ├── EventBus — async pub/sub between agents")
    click.echo("│   ├── SharedMemory — single source of truth")
    click.echo("│   ├── HealthMonitor — self-healing for failed agents")
    click.echo("│   └── LearningEngine — continuous self-improvement")
    click.echo("└── Control Plane")
    click.echo("    ├── FastAPI — REST API for human oversight")
    click.echo("    └── CLI — command line interface\n")
    click.echo("To start: export ANTHROPIC_API_KEY=your_key && python -m saas_agent_system.cli.main run --with-api")


if __name__ == "__main__":
    cli()
