import os
import shutil
from typing import List, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_
from app.models.tenant import Tenant
from app.models.user import User
from app.models.transaction import Transaction
from app.schemas.tenant import TenantCreate, TenantUpdate

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class TenantService:
    @staticmethod
    def _apply_ownership_scope(query, current_user: User):
        if current_user.user_type != "SA":
            query = query.where(Tenant.parent_id == current_user.id)
        return query

    @staticmethod
    async def get_tenants(db: AsyncSession, current_user: User) -> List[Tenant]:
        query = select(Tenant)
        query = TenantService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_tenant(db: AsyncSession, tenant_id: int, current_user: User) -> Optional[Tenant]:
        query = select(Tenant).where(Tenant.id == tenant_id)
        query = TenantService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def check_room_availability(db: AsyncSession, room_no: str, exclude_tenant_id: int = None) -> bool:
        query = select(Tenant).where(Tenant.room_no == room_no, Tenant.status == "active")
        if exclude_tenant_id:
            query = query.where(Tenant.id != exclude_tenant_id)
        result = await db.execute(query)
        return result.scalar_one_or_none() is None

    @staticmethod
    async def create_tenant(db: AsyncSession, tenant_data: TenantCreate, current_user: User) -> Tenant:
        is_available = await TenantService.check_room_availability(db, tenant_data.room_no)
        if not is_available:
            raise HTTPException(status_code=400, detail="Room is already occupied by an active tenant")

        new_tenant = Tenant(**tenant_data.model_dump(), parent_id=current_user.id)
        db.add(new_tenant)
        await db.commit()
        await db.refresh(new_tenant)
        return new_tenant

    @staticmethod
    async def update_tenant(db: AsyncSession, tenant_id: int, tenant_data: TenantUpdate, current_user: User) -> Tenant:
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        if tenant_data.room_no and tenant_data.room_no != tenant.room_no:
            is_available = await TenantService.check_room_availability(db, tenant_data.room_no, exclude_tenant_id=tenant_id)
            if not is_available:
                raise HTTPException(status_code=400, detail="Room is already occupied by an active tenant")

        update_data = tenant_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(tenant, key, value)
            
        await db.commit()
        await db.refresh(tenant)
        return tenant

    @staticmethod
    async def upload_aadhaar(db: AsyncSession, tenant_id: int, files: List[UploadFile], current_user: User) -> Tenant:
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        file_paths = []
        for file in files:
            file_location = os.path.join(UPLOAD_DIR, f"{tenant.id}_{file.filename}")
            with open(file_location, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            # Store relative path
            file_paths.append(f"/uploads/{tenant.id}_{file.filename}")
            
        tenant.aadhaar_images = tenant.aadhaar_images + file_paths
        await db.commit()
        await db.refresh(tenant)
        return tenant

    @staticmethod
    async def delete_tenant(db: AsyncSession, tenant_id: int, current_user: User):
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        await db.delete(tenant)
        await db.commit()
        return True

    @staticmethod
    async def get_tenant_transactions(db: AsyncSession, tenant_id: int, current_user: User) -> List[Transaction]:
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
            
        query = select(Transaction).where(Transaction.tenant_id == tenant_id).order_by(Transaction.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()
