import uuid
from datetime import datetime
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from utils import utcnow


class BotUser(SQLModel, table=True):
    __tablename__ = "bot_users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    platform_user_id: str = Field(unique=True, index=True)
    platform: str  # line / telegram / web
    display_name: str = ""
    avatar_url: Optional[str] = None
    role: str = ""
    status: str = ""
    notes: Optional[str] = None
    meta: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON))
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
