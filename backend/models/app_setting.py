import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field
from utils import utcnow


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
