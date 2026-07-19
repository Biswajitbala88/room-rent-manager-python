from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from app.schemas.room import RoomResponse, RoomCreate, RoomUpdate
from app.services.room_service import RoomService

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

@router.get("/", response_model=List[RoomResponse])
async def list_rooms(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await RoomService.get_rooms(db, current_user)

@router.post("/", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    room_data: RoomCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type not in ["SA", "A"]:
        raise HTTPException(status_code=403, detail="Permission denied. Only Admins can manage rooms.")
    return await RoomService.create_room(db, room_data, current_user)

@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = await RoomService.get_room(db, room_id, current_user)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@router.put("/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: int,
    room_data: RoomUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type not in ["SA", "A"]:
        raise HTTPException(status_code=403, detail="Permission denied. Only Admins can manage rooms.")
    return await RoomService.update_room(db, room_id, room_data, current_user)

@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type not in ["SA", "A"]:
        raise HTTPException(status_code=403, detail="Permission denied. Only Admins can manage rooms.")
    await RoomService.delete_room(db, room_id, current_user)
