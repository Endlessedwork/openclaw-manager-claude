import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from utils import utcnow


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_key: str = Field(unique=True, index=True)
    agent_id: str = Field(index=True)
    platform: str = ""
    peer_id: str = ""
    model_used: Optional[str] = None
    total_tokens: int = 0
    status: str = Field(default="active", index=True)  # active / ended / reset
    started_at: datetime = Field(default_factory=utcnow)
    last_activity_at: datetime = Field(default_factory=utcnow)
    context_summary: Optional[str] = None
