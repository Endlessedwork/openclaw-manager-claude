import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from utils import utcnow


class AIChatThread(SQLModel, table=True):
    __tablename__ = "ai_chat_threads"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: int = Field(index=True)
    title: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AIChatMessage(SQLModel, table=True):
    __tablename__ = "ai_chat_messages"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(foreign_key="ai_chat_threads.id", index=True)
    role: str = ""
    content: str = ""
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
