# Room Rent Manager - Setup & Run Guide

This guide provides step-by-step instructions on how to clone the repository, configure the environment, and run both the FastAPI backend and Next.js frontend locally.

---

## 1. Prerequisites

Before you begin, ensure your system has the following installed:
- **Git:** For cloning the repository.
- **Python 3.10+:** For running the FastAPI backend.
- **Node.js (v22+):** For running the Next.js frontend. (Using `nvm` is recommended).
- **PostgreSQL:** For the database.

---

## 2. Clone the Repository

First, clone the repository to your local machine:

```bash
git clone https://github.com/Biswajitbala88/room-rent-manager-python.git
cd room-rent-manager-python
```

---

## 3. Database Setup

Ensure PostgreSQL is running on your machine. You need to create a database for the application.

1. Open your PostgreSQL interactive terminal (`psql`):
   ```bash
   sudo -u postgres psql
   ```
2. Create the database:
   ```sql
   CREATE DATABASE room_rent_manager;
   ```
3. Exit the terminal (`\q`).

*(Note: The application expects the default user `postgres` with password `root`. If your credentials differ, you will update them in the backend `.env` file in the next step).*

---

## 4. Backend Setup (FastAPI)

The backend handles the API, business logic, and database connections.

### Step 4.1: Create a Virtual Environment
Navigate to the backend directory and create a virtual environment to isolate dependencies:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### Step 4.2: Install Dependencies
Install the required Python packages:
```bash
pip install -r requirements.txt
```

### Step 4.3: Configure Environment Variables
Create a `.env` file in the `backend/` directory (if it doesn't already exist):
```bash
touch .env
```
Add the following configuration to the `.env` file. Adjust the `DATABASE_URL` if your PostgreSQL credentials differ:
```ini
DATABASE_URL=postgresql+asyncpg://postgres:root@127.0.0.1:5432/room_rent_manager
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

### Step 4.4: Run Database Migrations
Run Alembic to generate the necessary tables in your PostgreSQL database:
```bash
alembic upgrade head
```

### Step 4.5: Start the Backend Server
Start the FastAPI server using Uvicorn:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API will now be running at [http://localhost:8000/api](http://localhost:8000/api).

---

## 5. Frontend Setup (Next.js)

The frontend provides the User Interface for the application. Open a **new terminal window** (keep the backend running in the first one).

### Step 5.1: Navigate and Use Correct Node Version
Navigate to the frontend directory and ensure you are using Node v22+:
```bash
cd room-rent-manager-python/frontend
source ~/.nvm/nvm.sh
nvm use 22
```

### Step 5.2: Install Dependencies
Install the required Node packages:
```bash
npm install
```

### Step 5.3: Start the Frontend Server
Start the Next.js development server:
```bash
npm run dev
```
The frontend application will now be running at [http://localhost:3000](http://localhost:3000).

---

## 6. Accessing the Application

1. Open your web browser and navigate to **[http://localhost:3000](http://localhost:3000)**.
2. Since it is a fresh database, click on **"Don't have an account? Register"** to create your first Super Admin account.
3. Log in with your newly created credentials.
4. You are now ready to add tenants, generate invoices, and view electricity reports!

> **API Documentation:** You can view the interactive Swagger API documentation for the backend by navigating to [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.



<!-- 1. edit btns not working.
2. invoice download btn not working.
3. add popup on clicik delete btn.
4. add some filter depend on filed.
5. dashboard count showing wrong as per parent id.
6. can we manage Role user.
7. how can we create Super admin, admin user, manager.
8. how to manage module as per user Role
9. check, how to clac the last and currect month electricity unit are calculate while create-edit invoice. electricity unit should be manage by room number, not tenant wise.
10. can we make room number module
11. add quick tool in dashhboard, where i can easily show the invoiced by filter tenant. and add received amt.
12. add a toggle btn in the menubar 
13. add media filed for tenant, where we can upload multiple image. and can view the image in large view in popup. -->