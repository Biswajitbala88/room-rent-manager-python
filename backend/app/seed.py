import asyncio
from sqlalchemy.future import select
from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.utils import get_password_hash

async def seed_super_admin():
    async with AsyncSessionLocal() as db:
        email = "biswajitbala88@gmail.com"
        password = "12345678"
        name = "Biswajit Bala"
        
        print(f"Checking if user {email} exists...")
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if user:
            print(f"User {email} exists. Updating to Super Admin and setting password...")
            user.user_type = "SA"
            user.name = name
            user.password_hash = get_password_hash(password)
        else:
            print(f"Creating new Super Admin user {email}...")
            user = User(
                name=name,
                email=email,
                password_hash=get_password_hash(password),
                user_type="SA"
            )
            db.add(user)
            
        await db.commit()
        print("Super Admin seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_super_admin())
