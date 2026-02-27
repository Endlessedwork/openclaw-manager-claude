import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from utils import utcnow


class BotGroup(SQLModel, table=True):
    __tablename__ = "bot_groups"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    platform_group_id: str = Field(unique=True, index=True)
    platform: str  # line / telegram
    name: str = ""
    status: str = "active"  # active / inactive
    member_count: int = 0
    members: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    assigned_agent_id: Optional[str] = None
    meta: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
