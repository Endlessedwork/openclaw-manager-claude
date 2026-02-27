import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from utils import utcnow


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    name: str
    role: str = Field(default="user")  # superadmin / admin / user
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_login: Optional[datetime] = None
