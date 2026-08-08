from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreate, RoomUpdate

from app.models.tenant import Tenant
from app.models.invoice import Invoice

class RoomService:
    @staticmethod
    def _get_owner_id(current_user: User) -> int:
        return current_user.parent_id if current_user.user_type == "M" else current_user.id

    @staticmethod
    def _apply_ownership_scope(query, current_user: User):
        if current_user.user_type != "SA":
            owner_id = RoomService._get_owner_id(current_user)
            query = query.where(Room.parent_id == owner_id)
        return query

    @staticmethod
    async def get_rooms(db: AsyncSession, current_user: User) -> List[Room]:
        query = select(Room)
        query = RoomService._apply_ownership_scope(query, current_user)
        query = query.order_by(Room.room_no)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_room(db: AsyncSession, room_id: int, current_user: User) -> Optional[Room]:
        query = select(Room).where(Room.id == room_id)
        query = RoomService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_room_by_no(db: AsyncSession, room_no: str, current_user: User, parent_id: Optional[int] = None) -> Optional[Room]:
        query = select(Room).where(Room.room_no == room_no)
        if parent_id is not None:
            query = query.where(Room.parent_id == parent_id)
        else:
            query = RoomService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_room(db: AsyncSession, room_data: RoomCreate, current_user: User) -> Room:
        owner_id = room_data.parent_id if (current_user.user_type == "SA" and room_data.parent_id) else RoomService._get_owner_id(current_user)
        
        # Check uniqueness per owner
        existing = await RoomService.get_room_by_no(db, room_data.room_no, current_user, parent_id=owner_id)
        if existing:
            raise HTTPException(status_code=400, detail=f"Room number '{room_data.room_no}' already exists for this owner.")

        room_dict = room_data.model_dump(exclude={"parent_id"})
        new_room = Room(**room_dict, parent_id=owner_id)
        db.add(new_room)
        await db.commit()
        await db.refresh(new_room)
        return new_room

    @staticmethod
    async def update_room(db: AsyncSession, room_id: int, room_data: RoomUpdate, current_user: User) -> Room:
        room = await RoomService.get_room(db, room_id, current_user)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        target_parent_id = room_data.parent_id if (current_user.user_type == "SA" and room_data.parent_id is not None) else room.parent_id

        if room_data.room_no and (room_data.room_no != room.room_no or target_parent_id != room.parent_id):
            existing = await RoomService.get_room_by_no(db, room_data.room_no, current_user, parent_id=target_parent_id)
            if existing and existing.id != room.id:
                raise HTTPException(status_code=400, detail=f"Room number '{room_data.room_no}' already exists.")

        update_data = room_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(room, key, value)

        await db.commit()
        await db.refresh(room)
        return room

    @staticmethod
    async def delete_room(db: AsyncSession, room_id: int, current_user: User) -> bool:
        room = await RoomService.get_room(db, room_id, current_user)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        # 1. Check for active tenants occupying this room
        active_tenants_res = await db.execute(
            select(Tenant).where(
                Tenant.room_no == room.room_no,
                Tenant.parent_id == room.parent_id,
                Tenant.status == "active"
            )
        )
        active_tenants = active_tenants_res.scalars().all()
        if active_tenants:
            names = ", ".join([t.name for t in active_tenants])
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete room '{room.room_no}' because it is occupied by active tenant(s): {names}. Please vacate or close their tenancy first."
            )

        # 2. Check for any tenant history linked to this room
        all_tenants_res = await db.execute(
            select(Tenant).where(
                Tenant.room_no == room.room_no,
                Tenant.parent_id == room.parent_id
            )
        )
        all_tenants = all_tenants_res.scalars().all()
        if all_tenants:
            names = ", ".join([t.name for t in all_tenants[:3]])
            more = f" and {len(all_tenants) - 3} more" if len(all_tenants) > 3 else ""
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete room '{room.room_no}' because {len(all_tenants)} tenant record(s) ({names}{more}) are linked to it. Please reassign or remove these tenant records first."
            )

        # 3. Check for invoices linked to this room
        invoice_res = await db.execute(
            select(Invoice).where(Invoice.room_no == room.room_no)
        )
        invoices = invoice_res.scalars().all()
        if invoices:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete room '{room.room_no}' because {len(invoices)} invoice record(s) are linked to it. Please remove associated invoices first."
            )

        # 4. Check if marked occupied
        if room.status == "occupied":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete room '{room.room_no}' because its status is marked as 'occupied'."
            )

        try:
            await db.delete(room)
            await db.commit()
            return True
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete room '{room.room_no}' due to database dependency: {str(e)}"
            )
