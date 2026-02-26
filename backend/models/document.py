import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class WorkspaceDocument(SQLModel, table=True):
    __tablename__ = "workspace_documents"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain: str = ""
    filename: str
    file_path: str
    file_type: str = ""
    file_size: int = 0
    sensitivity: str = "internal"  # public / internal / confidential
    uploaded_by: Optional[str] = None
    approved_by: Optional[str] = None
    meta: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
