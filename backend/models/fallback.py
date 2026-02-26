import uuid
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text


class AgentFallback(SQLModel, table=True):
    __tablename__ = "agent_fallbacks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(unique=True, index=True)
    fallbacks: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
