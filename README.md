# SaaS AI Agent System

A **self-healing, self-learning** AI agent fleet that operates a SaaS company with 90% AI automation — powered by Claude Opus 4.6.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SaaS Orchestrator (CEO)                   │
│         Analyzes state → Delegates tasks → Learns           │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │   Agent Fleet       │    │  Core Infrastructure │
    │                     │    │                      │
    │ ProductAgent (CPO)  │    │ EventBus             │
    │ EngineeringAgent    │    │ SharedMemory         │
    │ SalesAgent (CRO)    │    │ HealthMonitor        │
    │ CSAgent (VP CS)     │    │ LearningEngine       │
    │ FinanceAgent (CFO)  │    └──────────────────────┘
    │ OperationsAgent     │
    └─────────────────────┘
          │
    ┌─────▼──────────────┐
    │  Control Plane      │
    │  FastAPI + CLI      │
    └─────────────────────┘
```

## Key Features

### Self-Healing
- `HealthMonitor` checks all agents every 30 seconds
- Detects stuck agents, high failure rates, and crashed states
- Automatically resets and heals unhealthy agents
- Agents retry failed tasks with exponential backoff (3x max)

### Self-Learning
The `LearningEngine` continuously improves the fleet:
1. Agents log learnings via `log_learning` tool during execution
2. Every 5 minutes: synthesize patterns from recent learnings using Claude Opus 4.6
3. Generate role-specific prompt improvements injected into future requests
4. Cross-pollinate insights across different agent roles

## Agent Roles

| Agent | Role | Responsibilities |
|-------|------|-----------------|
| **ProductAgent** | CPO | Roadmap, features, PMF, user research, OKRs |
| **EngineeringAgent** | VPE | Architecture, CI/CD, incidents, security, DORA metrics |
| **SalesAgent** | CRO | Pipeline, revenue, marketing, partnerships, forecasting |
| **CustomerSuccessAgent** | VP CS | Onboarding, retention, NPS, churn, expansion |
| **FinanceAgent** | CFO | Financials, runway, unit economics, compliance |
| **OperationsAgent** | COO | Processes, hiring, legal, vendors, compliance |

## Quick Start

### 1. Install

```bash
pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY
```

### 3. Run

```bash
# Start with REST API
python -m saas_agent_system run --with-api

# Custom cycle interval (default: 60s)
python -m saas_agent_system run --with-api --cycle-interval 120
```

### 4. Monitor

```bash
python -m saas_agent_system dashboard   # live dashboard
python -m saas_agent_system status      # status summary
python -m saas_agent_system events      # recent events
```

### 5. Dispatch Tasks

```bash
python -m saas_agent_system dispatch sales pipeline_review \
  "Review pipeline and advance top 3 deals to next stage"
```

## REST API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /status` | Full system status |
| `GET /metrics` | Business KPIs (MRR, ARR, NPS, etc.) |
| `GET /agents` | All agent health metrics |
| `POST /tasks/dispatch/sync` | Dispatch task and wait for result |
| `GET /events` | Recent system events |
| `GET /learning/stats` | Learning engine statistics |
| `GET /learning/patterns` | Discovered behavioral patterns |
| `POST /orchestrator/cycle` | Trigger a manual orchestration cycle |
| `POST /orchestrator/heal/{agent}` | Manually heal a specific agent |

## What 90% Automation Covers

- Product strategy, feature prioritization, roadmap updates
- Code architecture decisions, incident response, security audits
- Lead scoring, pipeline management, campaign creation
- Customer health monitoring, churn prediction, support triage
- Financial modeling, expense tracking, burn/runway analysis
- Process documentation, vendor management, compliance tracking

## The 10% Humans Handle

- Strategic pivots (new market, major product pivot)
- Fundraising and board decisions
- Senior hires (VP level and above)
- Legal matters with significant exposure (>$50K)
- Actions requiring physical world interaction

## Data Persistence

All data in `saas_agent_system/data/`:
- `memory/` — agent memory + shared company state
- `logs/` — event log + system logs
- `metrics/` — health snapshots
- `knowledge/` — learnings, patterns, prompt improvements

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | Anthropic API key |
| `COMPANY_NAME` | `SaaS Co` | Your company name |
| `CYCLE_INTERVAL` | `60` | Orchestration cycle in seconds |
| `API_PORT` | `8000` | API server port |
