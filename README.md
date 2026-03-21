# AgentLens

**Observe every decision. Simulate every scenario. Ship with certainty.**

AgentLens is open-source infrastructure for AI agent observability and simulation. Connect any AI agent with one line of code, build a behavioral fingerprint from production traffic, then simulate it through hypothetical scenarios before deploying changes. Think of it as a flight simulator for AI systems.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![Next.js](https://img.shields.io/badge/next.js-14-black.svg)](https://nextjs.org)

---

## What It Does

- **Observe** — Capture every LLM call, tool use, and decision as structured event streams via pluggable connectors (OpenAI, LangChain, webhooks)
- **Understand** — Build behavioral fingerprints that model how your agent actually behaves: decision graphs, path frequencies, drift detection
- **Simulate** — Fork fingerprints into simulation twins, inject scenarios, stress-test edge cases, run regression checks before deploying changes

## Quick Start

```bash
# Clone and run
git clone https://github.com/jawaddxb/agentlens.git
cd agentlens

# Option 1: Docker (recommended)
docker-compose up

# Option 2: Manual
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000 &

# Frontend
cd ../frontend
npm install --legacy-peer-deps
npm run dev

# Seed demo data
curl -X POST http://localhost:8000/api/seed
```

Open [http://localhost:3000](http://localhost:3000) — you should see the agent dashboard with live data.

## Connect Your Agent

```python
# OpenAI — one line
from agentlens.connectors.openai_connector import OpenAIInstrumentor
OpenAIInstrumentor().instrument(client, agent_id="my-agent", api_url="http://localhost:8000")

# LangChain — one callback
from agentlens.connectors.langchain_connector import LensCallbackHandler
chain.run(callbacks=[LensCallbackHandler(agent_id="my-agent")])

# Any HTTP endpoint — one header
headers = {"X-AgentLens-Project": "my-agent"}
```

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              AgentLens UI                │
                    │         Next.js 14 + D3 + Charts         │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
┌──────────────┐   ┌─────────────────────────────────────────┐
│   Connectors  │──▶│            FastAPI Backend               │
│  OpenAI       │   │                                         │
│  LangChain    │   │  ┌──────────┐ ┌────────────┐ ┌───────┐ │
│  Webhook      │   │  │Normaliser│ │Fingerprint │ │ Drift │ │
└──────────────┘   │  └──────────┘ └────────────┘ └───────┘ │
                    │                                         │
                    │  ┌──────────────────────────────────┐   │
                    │  │       Simulation Engine           │   │
                    │  │  Twins · Runner · Scenarios       │   │
                    │  └──────────────────────────────────┘   │
                    │                                         │
                    │  ┌──────────────────────────────────┐   │
                    │  │        SQLite / PostgreSQL        │   │
                    │  └──────────────────────────────────┘   │
                    └─────────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────────┐
                    │         Vanar Stack (Optional)           │
                    │  Neutron Memory · xBPP Policy · Knowracle│
                    └─────────────────────────────────────────┘
```

## Screens

| Screen | Description |
|--------|-------------|
| **Agent Dashboard** | Grid of agent cards with live stats, real-time activity feed, behavioral overview |
| **Trace Explorer** | D3 execution graph of individual traces, step-by-step inspector |
| **Behavioral Fingerprint** | Force-directed decision graph, top paths, drift alerts, temporal heatmap |
| **Simulation Lab** | Configure and run simulations, watch twin network in real-time, divergence analysis |

## Vanar Stack Integration

AgentLens integrates with the Vanar ecosystem for enterprise governance:

- **Neutron** — Persistent encrypted memory across simulation runs
- **xBPP** — Policy governance engine with 12-check policy enforcement (ALLOW/BLOCK/ESCALATE)
- **Knowracle** — On-chain attestation for tamper-proof audit trails anchored to Vanar Chain

These integrations are optional plugins. The core platform works standalone.

## Tech Stack

- **Backend:** Python 3.12+, FastAPI, SQLAlchemy, aiosqlite
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, D3.js, Chart.js, Framer Motion
- **Simulation:** asyncio-based parallel twin execution, optional OpenRouter LLM calls

## License

Apache 2.0 — free to use, modify, and distribute.

---

Built with precision by [Jawad](https://github.com/jawaddxb) and [Jarvis](https://jawad.ai).
