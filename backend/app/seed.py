import asyncio
from sqlalchemy.future import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.utils import get_password_hash

async def seed_data():
    async with AsyncSessionLocal() as db:
        # 1. Seed Super Admin
        sa_email = "superadmin@user.com"
        sa_password = "12345678"
        sa_name = "Super Admin"
        
        print(f"Checking if user {sa_email} exists...")
        result = await db.execute(select(User).where(User.email == sa_email))
        sa_user = result.scalar_one_or_none()
        
        if sa_user:
            print(f"User {sa_email} exists. Updating password and role...")
            sa_user.user_type = "SA"
            sa_user.name = sa_name
            sa_user.password_hash = get_password_hash(sa_password)
        else:
            print(f"Creating new Super Admin user {sa_email}...")
            sa_user = User(
                name=sa_name,
                email=sa_email,
                password_hash=get_password_hash(sa_password),
                user_type="SA"
            )
            db.add(sa_user)
        
        # 2. Seed Admin
        admin_email = "admin@user.com"
        admin_password = "12345678"
        admin_name = "Admin"
        
        print(f"Checking if user {admin_email} exists...")
        result = await db.execute(select(User).where(User.email == admin_email))
        admin_user = result.scalar_one_or_none()
        
        if admin_user:
            print(f"User {admin_email} exists. Updating password and role...")
            admin_user.user_type = "A"
            admin_user.name = admin_name
            admin_user.password_hash = get_password_hash(admin_password)
        else:
            print(f"Creating new Admin user {admin_email}...")
            admin_user = User(
                name=admin_name,
                email=admin_email,
                password_hash=get_password_hash(admin_password),
                user_type="A"
            )
            db.add(admin_user)
            
        await db.commit()
        await db.refresh(admin_user)
        
        # 3. Seed Manager
        manager_email = "manager@user.com"
        manager_password = "12345678"
        manager_name = "Manager"
        
        print(f"Checking if user {manager_email} exists...")
        result = await db.execute(select(User).where(User.email == manager_email))
        manager_user = result.scalar_one_or_none()
        
        if manager_user:
            print(f"User {manager_email} exists. Updating password, role, and parent_id...")
            manager_user.user_type = "M"
            manager_user.name = manager_name
            manager_user.password_hash = get_password_hash(manager_password)
            manager_user.parent_id = admin_user.id
        else:
            print(f"Creating new Manager user {manager_email}...")
            manager_user = User(
                name=manager_name,
                email=manager_email,
                password_hash=get_password_hash(manager_password),
                user_type="M",
                parent_id=admin_user.id
            )
            db.add(manager_user)
            
        await db.commit()
        print("All users seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_data())
