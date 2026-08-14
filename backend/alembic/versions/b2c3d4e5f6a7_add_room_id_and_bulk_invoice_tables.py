"""add_room_id_and_bulk_invoice_tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add room_id to invoices (nullable — legacy rows may not resolve to a room).
    op.add_column('invoices', sa.Column('room_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_invoices_room_id_rooms', 'invoices', 'rooms', ['room_id'], ['id'])
    op.create_index(op.f('ix_invoices_room_id'), 'invoices', ['room_id'], unique=False)

    # 2. Backfill room_id for existing invoices by matching room_no + owner (parent_id)
    # via the invoice's tenant, the same join already used elsewhere in the app.
    op.execute("""
        UPDATE invoices i
        SET room_id = r.id
        FROM tenants t, rooms r
        WHERE i.tenant_id = t.id
          AND r.room_no = i.room_no
          AND r.parent_id = t.parent_id
    """)

    # 3. Enforce one invoice per tenant per month at the DB level. This (not room+month)
    # is the correct business key: real data has cases where a room gets two legitimate
    # invoices in the same month because one tenant moved out and another moved in
    # mid-month (a closing invoice for the outgoing tenant, a regular one for the
    # incoming tenant) — a room+month constraint would incorrectly block that. Bulk
    # creation always resolves "the room's current active tenant" first, so re-running
    # it for the same room+month still always targets the same tenant_id and is still
    # fully blocked by this constraint.
    op.create_unique_constraint('uq_invoices_tenant_id_month', 'invoices', ['tenant_id', 'month'])

    # 4. Bulk invoice operation tracking tables.
    op.create_table(
        'bulk_invoice_operations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requested_by', sa.Integer(), nullable=True),
        sa.Column('month', sa.String(length=7), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('total_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('completed_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('failed_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('skipped_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bulk_invoice_operations_id'), 'bulk_invoice_operations', ['id'], unique=False)

    op.create_table(
        'bulk_invoice_operation_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('operation_id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=True),
        sa.Column('room_no', sa.String(length=50), nullable=True),
        sa.Column('tenant_id', sa.Integer(), nullable=True),
        sa.Column('current_reading', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('invoice_id', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['operation_id'], ['bulk_invoice_operations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bulk_invoice_operation_items_id'), 'bulk_invoice_operation_items', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_bulk_invoice_operation_items_id'), table_name='bulk_invoice_operation_items')
    op.drop_table('bulk_invoice_operation_items')
    op.drop_index(op.f('ix_bulk_invoice_operations_id'), table_name='bulk_invoice_operations')
    op.drop_table('bulk_invoice_operations')

    op.drop_constraint('uq_invoices_tenant_id_month', 'invoices', type_='unique')
    op.drop_index(op.f('ix_invoices_room_id'), table_name='invoices')
    op.drop_constraint('fk_invoices_room_id_rooms', 'invoices', type_='foreignkey')
    op.drop_column('invoices', 'room_id')
