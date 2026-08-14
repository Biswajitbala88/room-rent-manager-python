from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class BulkInvoiceOperation(Base):
    __tablename__ = "bulk_invoice_operations"

    id = Column(Integer, primary_key=True, index=True)
    # Informational only (not a FK) — same reasoning as SyncLog.triggered_by: this table
    # must never block/cascade against `users`.
    requested_by = Column(Integer, nullable=True)
    month = Column(String(7), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending, processing, completed, partially_completed, failed
    total_count = Column(Integer, default=0, nullable=False)
    completed_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    skipped_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)

    items = relationship("BulkInvoiceOperationItem", back_populates="operation", cascade="all, delete")


class BulkInvoiceOperationItem(Base):
    __tablename__ = "bulk_invoice_operation_items"

    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(Integer, ForeignKey("bulk_invoice_operations.id", ondelete="CASCADE"), nullable=False)
    room_id = Column(Integer, nullable=True)
    room_no = Column(String(50), nullable=True)
    tenant_id = Column(Integer, nullable=True)
    current_reading = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, processing, completed, failed, skipped_duplicate
    invoice_id = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    operation = relationship("BulkInvoiceOperation", back_populates="items")
