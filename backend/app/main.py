from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, profile, tenants, invoices

app = FastAPI(title="Room Rent Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(tenants.router)
app.include_router(invoices.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Room Rent Manager API"}
