"""add app_settings table

Revision ID: a1b2c3d4e5f6
Revises: 2cc2a99f92d5
Create Date: 2026-02-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
import uuid
from datetime import datetime, timezone


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '2cc2a99f92d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create app_settings table and seed defaults."""
    op.create_table('app_settings',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('value', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_app_settings_key'), 'app_settings', ['key'], unique=True)

    # Seed default settings
    now = datetime.now(timezone.utc)
    op.execute(
        sa.text(
            "INSERT INTO app_settings (id, key, value, created_at, updated_at) VALUES "
            "(:id1, 'app_name', 'W.I.N.E', :now, :now), "
            "(:id2, 'app_subtitle', 'Operation Control', :now, :now), "
            "(:id3, 'app_version', '3.0', :now, :now)"
        ).bindparams(
            id1=uuid.uuid4(), id2=uuid.uuid4(), id3=uuid.uuid4(), now=now
        )
    )


def downgrade() -> None:
    """Drop app_settings table."""
    op.drop_index(op.f('ix_app_settings_key'), table_name='app_settings')
    op.drop_table('app_settings')
