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

from app.models.room import Room

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class TenantService:
    @staticmethod
    def _get_owner_id(current_user: User) -> int:
        return current_user.parent_id if current_user.user_type == "M" else current_user.id

    @staticmethod
    def _apply_ownership_scope(query, current_user: User):
        if current_user.user_type == "M":
            query = query.where(Tenant.manager_id == current_user.id)
        elif current_user.user_type == "A":
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
    async def check_room_availability(db: AsyncSession, room_no: str, parent_id: int, exclude_tenant_id: int = None) -> bool:
        query = select(Tenant).where(
            Tenant.room_no == room_no, 
            Tenant.status == "active",
            Tenant.parent_id == parent_id
        )
        if exclude_tenant_id:
            query = query.where(Tenant.id != exclude_tenant_id)
        result = await db.execute(query)
        return result.scalar_one_or_none() is None

    @staticmethod
    async def create_tenant(db: AsyncSession, tenant_data: TenantCreate, current_user: User) -> Tenant:
        # Determine parent_id
        if current_user.user_type == "SA":
            if not tenant_data.parent_id:
                raise HTTPException(status_code=400, detail="Super Admin must specify a parent Admin ID")
            parent_id = tenant_data.parent_id
        else:
            parent_id = TenantService._get_owner_id(current_user)

        is_available = await TenantService.check_room_availability(db, tenant_data.room_no, parent_id)
        if not is_available:
            raise HTTPException(status_code=400, detail="Room is already occupied by an active tenant")

        new_tenant = Tenant(
            parent_id=parent_id,
            manager_id=tenant_data.manager_id,
            name=tenant_data.name,
            phone=tenant_data.phone,
            room_no=tenant_data.room_no,
            start_date=tenant_data.start_date,
            rent_amount=tenant_data.rent_amount,
            is_water_charge=tenant_data.is_water_charge,
            water_charge=tenant_data.water_charge,
            is_advanced=tenant_data.is_advanced,
            status="active"
        )
        db.add(new_tenant)

        # Update room status to occupied if room exists
        room_res = await db.execute(select(Room).where(Room.room_no == tenant_data.room_no, Room.parent_id == parent_id))
        room = room_res.scalar_one_or_none()
        if room:
            room.status = "occupied"

        await db.commit()
        await db.refresh(new_tenant)
        return new_tenant

    @staticmethod
    async def update_tenant(db: AsyncSession, tenant_id: int, tenant_data: TenantUpdate, current_user: User) -> Tenant:
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        old_parent_id = tenant.parent_id
        new_parent_id = tenant_data.parent_id if (tenant_data.parent_id is not None and current_user.user_type == "SA") else old_parent_id
        old_room_no = tenant.room_no
        new_room_no = tenant_data.room_no if tenant_data.room_no is not None else old_room_no

        if new_room_no != old_room_no or new_parent_id != old_parent_id:
            is_available = await TenantService.check_room_availability(db, new_room_no, new_parent_id, exclude_tenant_id=tenant_id)
            if not is_available:
                raise HTTPException(status_code=400, detail="Room is already occupied by an active tenant")

        update_data = tenant_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(tenant, key, value)

        # Handle room status changes
        if new_room_no != old_room_no or new_parent_id != old_parent_id:
            # Set old room in old parent to vacant
            old_room_res = await db.execute(select(Room).where(Room.room_no == old_room_no, Room.parent_id == old_parent_id))
            old_room = old_room_res.scalar_one_or_none()
            if old_room:
                old_room.status = "vacant"
            # Set new room in new parent to occupied
            new_room_res = await db.execute(select(Room).where(Room.room_no == new_room_no, Room.parent_id == new_parent_id))
            new_room = new_room_res.scalar_one_or_none()
            if new_room:
                new_room.status = "occupied"

        # Also, if tenant status changed to closed, set room to vacant
        if tenant_data.status == "close":
            room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == new_parent_id))
            room = room_res.scalar_one_or_none()
            if room:
                room.status = "vacant"

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
        
        parent_id = tenant.parent_id
        room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == parent_id))
        room = room_res.scalar_one_or_none()
        if room:
            # Check if any OTHER active tenant is in the room
            other_active_res = await db.execute(
                select(Tenant).where(
                    Tenant.room_no == tenant.room_no,
                    Tenant.parent_id == parent_id,
                    Tenant.status == "active",
                    Tenant.id != tenant_id
                )
            )
            if not other_active_res.scalar_one_or_none():
                room.status = "vacant"

        try:
            await db.delete(tenant)
            await db.commit()
            return True
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete tenant '{tenant.name}': {str(e)}"
            )

    @staticmethod
    async def get_tenant_transactions(db: AsyncSession, tenant_id: int, current_user: User) -> List[Transaction]:
        tenant = await TenantService.get_tenant(db, tenant_id, current_user)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
            
        query = select(Transaction).where(Transaction.tenant_id == tenant_id).order_by(Transaction.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()
