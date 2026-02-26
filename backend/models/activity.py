import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    action: str
    entity_type: str
    entity_id: str = ""
    details: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


class AgentActivity(SQLModel, table=True):
    __tablename__ = "agent_activities"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(index=True)
    agent_name: str = ""
    event_type: str = Field(index=True)  # tool_call / llm_request / message_received
    tool_name: Optional[str] = None
    status: str = "completed"  # completed / error / running
    duration_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    channel: Optional[str] = None
    model_used: Optional[str] = None
    message: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


class SystemLog(SQLModel, table=True):
    __tablename__ = "system_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    level: str = Field(index=True)  # INFO / WARN / ERROR
    source: str = Field(default="", index=True)
    message: str = ""
    raw: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
