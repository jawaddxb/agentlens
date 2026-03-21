# agentlens SDK

[![PyPI](https://img.shields.io/pypi/v/agentlens)](https://pypi.org/project/agentlens/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Official Python SDK for [AgentLens](https://github.com/jawaddxb/agentlens) — AI agent observability, behavioral fingerprinting, and simulation.

## Install

```bash
pip install agentlens
# or with OpenAI integration:
pip install "agentlens[openai]"
# or everything:
pip install "agentlens[all]"
```

## Quick Start

### Example 1: OpenAI auto-instrumentation

```python
import os
from openai import OpenAI
from agentlens import LensClient, instrument_openai

# Connect to your AgentLens backend
lens = LensClient(
    url=os.getenv("AGENTLENS_URL", "http://localhost:8002"),
    agent_name="my-gpt-agent",
)

# One call patches the client — all subsequent calls emit events
oai = OpenAI()
instrument_openai(lens, oai)

# This call now automatically sends model, tokens, latency to AgentLens
response = oai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is observability?"}],
)
print(response.choices[0].message.content)
```

### Example 2: LangChain callback handler

```python
import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from agentlens import LensClient, LensCallbackHandler

lens = LensClient(
    url=os.getenv("AGENTLENS_URL", "http://localhost:8002"),
    agent_name="my-langchain-agent",
)
handler = LensCallbackHandler(lens)

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
response = llm.invoke([HumanMessage(content="Tell me about AI agents.")])
print(response.content)
```

### Example 3: Raw event sending (any framework)

```python
import os
import time
from agentlens import LensClient

lens = LensClient(
    url=os.getenv("AGENTLENS_URL", "http://localhost:8002"),
    agent_name="my-custom-agent",
    api_key=os.getenv("AGENTLENS_API_KEY"),  # optional
)

# Start a trace (groups related events together)
trace_id = lens.start_trace()

try:
    start = time.monotonic()

    # ... your agent logic here ...
    result = {"answer": "42", "confidence": 0.95}

    latency_ms = (time.monotonic() - start) * 1000

    # Send a custom event
    lens.send_event(
        event_type="agent_response",
        data={
            "response": result["answer"],
            "confidence": result["confidence"],
            "latency_ms": round(latency_ms, 2),
            "status": "ok",
        },
        trace_id=trace_id,
    )
finally:
    lens.end_trace(trace_id)
```

## FastAPI middleware

```python
from fastapi import FastAPI
from agentlens import LensClient
from agentlens.integrations.http import make_fastapi_middleware

app = FastAPI()
lens = LensClient(url="http://localhost:8002", agent_name="my-api")
app.add_middleware(make_fastapi_middleware(lens))
```

Pass `X-AgentLens-Token: <trace_id>` header in requests to group events by trace.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTLENS_URL` | `http://localhost:8002` | Backend base URL |
| `AGENTLENS_AGENT` | `default-agent` | Agent name for events |
| `AGENTLENS_API_KEY` | *(none)* | Optional API key |

## LensClient API

```python
client = LensClient(url, agent_name, api_key)

# Traces
trace_id = client.start_trace()          # -> str
client.end_trace(trace_id)               # emits trace_end event

# Events (fire-and-forget, background thread)
client.send_event(event_type, data, trace_id=None)

# Batch send
client.send_batch([{...}, {...}])        # up to 500 events
```

## License

MIT © 2026 AgentLens contributors
