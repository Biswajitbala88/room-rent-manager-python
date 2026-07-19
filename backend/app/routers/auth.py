from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, Token
from app.schemas.user import UserResponse
from app.utils import verify_password, get_password_hash, create_access_token
from app.config import settings
from jose import jwt, JWTError
from typing import Optional

from sqlalchemy import func

router = APIRouter(prefix="/api/auth", tags=["auth"])

async def get_current_user_optional(request: Request, db: AsyncSession) -> Optional[User]:
    token = None
    # Check header
    auth_header = request.headers.get("Authorization")
    if auth_header:
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        else:
            token = auth_header
    else:
        # Check cookie
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            if cookie_token.startswith("Bearer "):
                token = cookie_token.split(" ")[1]
            else:
                token = cookie_token
                
    if not token:
        return None
        
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
    except JWTError:
        return None

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    user_data: UserCreate, 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if request has a valid SA user logged in
    acting_user = await get_current_user_optional(request, db)
    
    count_res = await db.execute(select(func.count(User.id)))
    user_count = count_res.scalar_one() or 0
    
    if acting_user and acting_user.user_type == "SA":
        # SA can create A or M
        user_type = user_data.user_type or "A"
        parent_id = user_data.parent_id
    else:
        # Standard registration
        user_type = "SA" if user_count == 0 else "A"
        parent_id = None

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        user_type=user_type,
        parent_id=parent_id
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.email})
    
    response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"detail": "Successfully logged out"}
