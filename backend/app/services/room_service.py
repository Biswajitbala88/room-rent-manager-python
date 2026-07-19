from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreate, RoomUpdate

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
    async def get_room_by_no(db: AsyncSession, room_no: str, current_user: User) -> Optional[Room]:
        query = select(Room).where(Room.room_no == room_no)
        query = RoomService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_room(db: AsyncSession, room_data: RoomCreate, current_user: User) -> Room:
        # Check uniqueness per owner
        existing = await RoomService.get_room_by_no(db, room_data.room_no, current_user)
        if existing:
            raise HTTPException(status_code=400, detail="Room number already exists")

        owner_id = RoomService._get_owner_id(current_user)
        new_room = Room(**room_data.model_dump(), parent_id=owner_id)
        db.add(new_room)
        await db.commit()
        await db.refresh(new_room)
        return new_room

    @staticmethod
    async def update_room(db: AsyncSession, room_id: int, room_data: RoomUpdate, current_user: User) -> Room:
        room = await RoomService.get_room(db, room_id, current_user)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        if room_data.room_no and room_data.room_no != room.room_no:
            existing = await RoomService.get_room_by_no(db, room_data.room_no, current_user)
            if existing:
                raise HTTPException(status_code=400, detail="Room number already exists")

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
        
        if room.status == "occupied":
            raise HTTPException(status_code=400, detail="Cannot delete an occupied room")

        await db.delete(room)
        await db.commit()
        return True
