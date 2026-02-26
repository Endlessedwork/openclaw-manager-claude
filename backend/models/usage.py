import uuid
import datetime as dt
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class DailyUsage(SQLModel, table=True):
    __tablename__ = "daily_usage"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    date: dt.date = Field(unique=True, index=True)
    total_tokens: int = 0
    total_cost: float = 0.0
    cost_breakdown: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
