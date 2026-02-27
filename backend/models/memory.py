import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from utils import utcnow


class AgentMemory(SQLModel, table=True):
    __tablename__ = "agent_memory"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(index=True)
    memory_type: str = Field(index=True)  # fact / preference / instruction / summary
    content: str = ""
    source: str = ""  # conversation / manual / system
    source_session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sessions.id")
    relevance_score: Optional[float] = None
    # embedding: pgvector column — add later via Alembic migration
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
