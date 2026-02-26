import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text
from utils import utcnow


class KnowledgeArticle(SQLModel, table=True):
    __tablename__ = "knowledge_articles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain: str = Field(index=True)
    title: str
    content: str = ""
    tags: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
    status: str = "published"  # draft / published
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
