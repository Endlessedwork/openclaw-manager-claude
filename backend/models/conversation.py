import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sessions.id", index=True)
    agent_id: str = Field(index=True)
    platform: str = ""
    peer_id: str = Field(default="", index=True)
    sender_type: str = ""  # user / agent / system
    sender_name: str = ""
    sender_platform_id: Optional[str] = None
    message: str = ""
    message_type: str = "text"  # text / image / tool_call / tool_result
    meta: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON))
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
