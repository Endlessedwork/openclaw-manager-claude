from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text


class ClawHubSkill(SQLModel, table=True):
    __tablename__ = "clawhub_skills"

    id: str = Field(primary_key=True)
    slug: str = ""
    name: str = ""
    description: str = ""
    category: str = ""
    tags: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
    downloads: int = 0
    version: str = ""
    installed: bool = False
    installed_version: Optional[str] = None
