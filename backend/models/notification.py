import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from utils import utcnow


class NotificationRule(SQLModel, table=True):
    __tablename__ = "notification_rules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_type: str = Field(index=True)  # "model_fallback", extensible
    channel: str = "telegram"  # notification channel
    target: str = ""  # chat ID / group ID
    target_name: str = ""  # human-readable name for display
    enabled: bool = Field(default=True)
    cooldown_minutes: int = Field(default=30)
    last_notified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
