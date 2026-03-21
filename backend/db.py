from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./agentlens.db")

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False)
metadata = MetaData()

# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------

agents = Table(
    "agents",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String(255), nullable=False),
    Column("description", Text, default=""),
    Column("connector_type", String(50), nullable=False),
    Column("status", String(20), default="active"),
    Column("config", JSON, default=dict),
    Column("created_at", DateTime, server_default=func.now()),
)

events = Table(
    "events",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("agent_id", Integer, ForeignKey("agents.id"), nullable=False),
    Column("trace_id", String(255), nullable=False),
    Column("event_type", String(100), nullable=False),
    Column("data", JSON, default=dict),
    Column("timestamp", DateTime, nullable=False),
    Column("created_at", DateTime, server_default=func.now()),
)

fingerprints = Table(
    "fingerprints",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("agent_id", Integer, ForeignKey("agents.id"), nullable=False),
    Column("fingerprint_data", JSON, default=dict),
    Column("created_at", DateTime, server_default=func.now()),
)

simulations = Table(
    "simulations",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("agent_id", Integer, ForeignKey("agents.id"), nullable=False),
    Column("scenario", Text, nullable=False),
    Column("config", JSON, default=dict),
    Column("status", String(20), default="pending"),
    Column("result_data", JSON, nullable=True),
    Column("created_at", DateTime, server_default=func.now()),
    Column("completed_at", DateTime, nullable=True),
)


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Create all tables if they do not exist."""
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncConnection, None]:
    """Yield an async connection that auto-commits on success."""
    async with engine.begin() as conn:
        yield conn
