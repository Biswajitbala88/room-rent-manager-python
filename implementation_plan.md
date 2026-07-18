# Room Rent Manager — Rebuild with FastAPI + Next.js + PostgreSQL

## Background

The existing app at `/var/www/html/room_rent_manager` is a **Laravel 11 + SQLite** monolith with Blade templates and TailwindCSS. It manages tenants, monthly invoices (rent + electricity + water), payment tracking, and PDF generation for a room rental business.

The rebuild target directory is `/var/www/html/room-rent-manager-python`.

> [!IMPORTANT]
> This rebuild will also **fix all 25 documented bugs** from [app_review.md](file:///var/www/html/room_rent_manager/app_review.md) in the original codebase.

---

## Existing App — Feature Summary

| Module | Features |
|--------|----------|
| **Auth** | Register, Login, Logout, Forgot/Reset Password, Email Verification, Profile Edit/Delete |
| **Dashboard** | Monthly summary cards (pending invoices, due amount, received amount, electricity stats), month filter (AJAX), due-payment tenant dropdown, inline payment collection, quick invoice creation modal |
| **Tenants** | CRUD, Aadhaar image upload (multiple), room availability check, water charge toggle, advance-paid flag, status (active/close), DataTables, transaction history modal |
| **Invoices** | CRUD, auto-calculate electricity charge from meter readings, last-unit AJAX lookup by room, water charge from tenant config, closing invoice (sets tenant to "close", skips rent if advance-paid), received amount + payment mode/date, "exclude from due" flag, PDF download |
| **Electricity** | Consumption report with month/tenant filters, pagination, total units & cost summary |
| **Transactions** | Auto-logged on invoice create/update/addPayment, viewable per-tenant via modal |
| **Roles** | `SA` (Super Admin) sees all data, `A` (Admin) sees only own tenants/invoices via `ofUser()` scope |

---

## Consolidated Database Schema (PostgreSQL)

Merging all 18 Laravel migrations into clean tables, fixing known issues.

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| email_verified_at | TIMESTAMPTZ | nullable |
| password_hash | VARCHAR(255) | NOT NULL |
| user_type | VARCHAR(5) | `SA` or `A`, default `A` |
| created_at | TIMESTAMPTZ | default now() |
| updated_at | TIMESTAMPTZ | default now() |

### `tenants`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| parent_id | INTEGER FK→users(id) | NOT NULL, set server-side from auth |
| name | VARCHAR(255) | NOT NULL |
| phone | VARCHAR(20) | nullable |
| room_no | VARCHAR(50) | NOT NULL |
| start_date | DATE | nullable |
| rent_amount | DECIMAL(10,2) | NOT NULL |
| aadhaar_images | JSONB | array of file paths, default `[]` |
| status | VARCHAR(20) | `active` / `close`, default `active` |
| is_water_charge | BOOLEAN | default false |
| water_charge | DECIMAL(8,2) | default 0 |
| is_advanced | BOOLEAN | default false |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `invoices`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK→tenants(id) ON DELETE CASCADE | NOT NULL |
| room_no | VARCHAR(50) | nullable, snapshot at creation |
| month | VARCHAR(7) | format `YYYY-MM`, NOT NULL |
| electricity_units | INTEGER | current meter reading, default 0 |
| electricity_charge | DECIMAL(8,2) | default 0 |
| water_charge | DECIMAL(8,2) | default 0 |
| rent_amount | DECIMAL(10,2) | **NEW** — snapshot of rent used in this invoice |
| total_amount | DECIMAL(10,2) | always server-calculated |
| received_amount | DECIMAL(10,2) | default 0 |
| is_excluded | BOOLEAN | default false |
| status | VARCHAR(20) | `unpaid` default (derived, kept for legacy) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

> [!NOTE]
> Added `rent_amount` column to invoices to snapshot the actual rent used — fixes Bug #23 (PDF showing tenant base rent instead of calculated rent).

### `transactions`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK→tenants(id) ON DELETE CASCADE | NOT NULL |
| invoice_id | INTEGER FK→invoices(id) ON DELETE CASCADE | nullable |
| amount | DECIMAL(8,2) | NOT NULL |
| payment_mode | VARCHAR(50) | `Cash`, `UPI`, `Bank Transfer` |
| payment_date | DATE | nullable |
| created_at | TIMESTAMPTZ | |

---

## Tech Stack & Project Structure

```
/var/www/html/room-rent-manager-python/
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, lifespan
│   │   ├── config.py           # Settings via pydantic-settings
│   │   ├── database.py         # SQLAlchemy async engine + session
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── tenant.py
│   │   │   ├── invoice.py
│   │   │   └── transaction.py
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   │   ├── auth.py
│   │   │   ├── tenant.py
│   │   │   ├── invoice.py
│   │   │   ├── transaction.py
│   │   │   └── dashboard.py
│   │   ├── routers/            # API route modules
│   │   │   ├── auth.py
│   │   │   ├── tenants.py
│   │   │   ├── invoices.py
│   │   │   ├── dashboard.py
│   │   │   ├── electricity.py
│   │   │   └── profile.py
│   │   ├── services/           # Business logic
│   │   │   ├── tenant_service.py
│   │   │   ├── invoice_service.py
│   │   │   └── pdf_service.py
│   │   ├── dependencies.py     # Auth dependency (get_current_user)
│   │   └── utils.py            # Helpers
│   ├── alembic/                # DB migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── uploads/                # Aadhaar images
│   └── .env
├── frontend/                   # Next.js (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout + font + global providers
│   │   │   ├── page.tsx        # Redirect to /login
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx  # Sidebar + topbar layout
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── tenants/
│   │   │   │   │   ├── page.tsx        # List
│   │   │   │   │   ├── new/page.tsx    # Create
│   │   │   │   │   └── [id]/edit/page.tsx
│   │   │   │   ├── invoices/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── new/page.tsx
│   │   │   │   │   └── [id]/edit/page.tsx
│   │   │   │   ├── electricity/page.tsx
│   │   │   │   └── profile/page.tsx
│   │   ├── components/
│   │   │   ├── ui/             # Reusable: Button, Input, Modal, Card, Table, Badge
│   │   │   ├── layout/         # Sidebar, Topbar, MobileNav
│   │   │   ├── dashboard/      # SummaryCards, DuePaymentsPanel, InvoiceModal
│   │   │   ├── tenants/        # TenantForm, TenantTable, TransactionModal
│   │   │   └── invoices/       # InvoiceForm, InvoiceTable
│   │   ├── lib/
│   │   │   ├── api.ts          # Axios instance with interceptors
│   │   │   └── utils.ts        # Formatters, constants
│   │   ├── hooks/              # useAuth, useTenants, useInvoices
│   │   └── types/              # TypeScript interfaces
│   ├── public/
│   ├── next.config.ts
│   ├── package.json
│   └── .env.local
└── README.md
```

### Key Dependencies

**Backend (`requirements.txt`)**:
- `fastapi`, `uvicorn[standard]`
- `sqlalchemy[asyncio]`, `asyncpg`
- `alembic`
- `pydantic-settings`
- `python-jose[cryptography]` (JWT)
- `passlib[bcrypt]`
- `python-multipart` (file uploads)
- `reportlab` or `weasyprint` (PDF generation)

**Frontend (`package.json`)**:
- `next`, `react`, `react-dom`, `typescript`
- `axios`
- `@tanstack/react-table` (replaces DataTables)
- `react-hot-toast` (notifications)
- `lucide-react` (icons)
- `date-fns` (date formatting)

---

## API Endpoints

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Login → returns JWT access + refresh tokens |
| POST | `/logout` | Invalidate token (client-side) |
| GET | `/me` | Get current user profile |
| PATCH | `/me` | Update profile (name, email) |
| PATCH | `/me/password` | Change password |

### Tenants (`/api/tenants`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List tenants (scoped by user role) |
| POST | `/` | Create tenant (parent_id set server-side) |
| GET | `/{id}` | Get tenant detail (with ownership check) |
| PUT | `/{id}` | Update tenant (with ownership check) |
| DELETE | `/{id}` | Delete tenant (with ownership check) |
| GET | `/{id}/transactions` | Transaction history (with ownership check) |

### Invoices (`/api/invoices`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List invoices (scoped by user role) |
| POST | `/` | Create invoice (server-calculates total) |
| GET | `/{id}` | Get invoice detail |
| PUT | `/{id}` | Update invoice (server-recalculates total) |
| DELETE | `/{id}` | Delete invoice |
| GET | `/{id}/download` | Download PDF |
| POST | `/{id}/add-payment` | Add payment (validated: no negative, no overpay) |
| GET | `/last-units/{room_no}/{month}` | AJAX: get previous meter reading |
| GET | `/due/{tenant_id}` | Get due invoices for tenant |

### Dashboard (`/api/dashboard`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary?month=YYYY-MM` | Summary stats (pending, due, received) |

### Electricity (`/api/electricity`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/?month=&tenant_id=&page=&limit=` | Paginated report with filters and totals |

---

## Bug Fixes Incorporated

| # | Bug | Fix in New Codebase |
|---|-----|-----|
| 1 | Config key mismatch (`electric_rate` vs `ELECTRIC_RATE`) | Single `ELECTRIC_RATE` env var via pydantic Settings |
| 2 | Dashboard AJAX expects JSON, server returns redirect | All API endpoints return JSON |
| 3 | `addPayment` no validation | Pydantic schema: amount > 0, amount ≤ remaining due |
| 4 | `Invoice.parentUser()` wrong relationship | Removed. Use `invoice.tenant.owner` join path |
| 5 | `paginate()` breaks clone query | Separate queries for aggregation vs pagination |
| 6 | Electricity controller missing `ofUser()` scope | All queries scoped via `get_user_filter()` dependency |
| 7 | DB Schema route unauthenticated | No such route exists in rebuild |
| 8 | No authorization on tenant/invoice operations | Ownership check in every service method |
| 9 | `getDueInvoices` no ownership check | Ownership validated before returning data |
| 10 | `parent_id` from client input | `parent_id = current_user.id` set server-side |
| 11 | Aadhaar images replaced not appended | Merge logic: keep existing + add new |
| 12 | `total_amount` user-editable on update | Server always recalculates total |
| 13 | Only positive payment diffs logged | Log both positive and negative transaction adjustments |
| 14 | Dashboard tenant dropdown excludes no-due tenants | Separate dropdown: all active tenants for invoice creation |
| 15 | Clone query issues in dashboard | Separate query builder per metric |
| 16-18 | Dead code / unused models | Not carried over |
| 20 | Tenant show page missing layout | Proper Next.js layout wraps all pages |
| 21 | `$key+1` numbering wrong with sort | React Table handles row numbering correctly |
| 22 | No validation error display | Frontend form shows field-level errors from API |
| 23 | PDF shows tenant base rent, not invoice rent | `rent_amount` stored on invoice, used in PDF |

---

## Authentication Strategy

- **JWT-based** with access tokens (short-lived, 30 min) and refresh tokens (7 days)
- Access token sent as `Authorization: Bearer <token>` header
- Tokens stored in `httpOnly` cookies set by Next.js API routes for security
- FastAPI dependency `get_current_user()` decodes and validates JWT on every protected route
- Role check: `SA` bypasses tenant ownership filters; `A` sees only own data

---

## Proposed Changes — Phased Execution

### Phase 1: Project Scaffolding
- Create directory `/var/www/html/room-rent-manager-python/`
- Initialize FastAPI backend with virtual env, `requirements.txt`, config
- Initialize Next.js frontend with TypeScript, App Router
- Set up PostgreSQL database `room_rent_manager`
- Configure Alembic for migrations

### Phase 2: Backend — Models & Database
- Create SQLAlchemy models: `User`, `Tenant`, `Invoice`, `Transaction`
- Write Alembic migration to create all tables
- Run migration against PostgreSQL

### Phase 3: Backend — Auth
- Implement register, login, JWT token generation
- `get_current_user` dependency
- Profile endpoints (get, update, change password)

### Phase 4: Backend — Tenant CRUD
- `TenantService` with create, update, delete, list
- Ownership scoping (`parent_id` filter for `A` users, no filter for `SA`)
- File upload for Aadhaar images (stored in `uploads/`)
- Room availability check
- Transaction history endpoint

### Phase 5: Backend — Invoice CRUD
- `InvoiceService` with create (auto-calc total), update (server-recalc), delete
- Add-payment endpoint with validation
- Last-units lookup
- Due invoices endpoint
- Closing invoice logic (set tenant status to `close`)
- PDF generation with ReportLab/WeasyPrint

### Phase 6: Backend — Dashboard & Electricity
- Dashboard summary endpoint (pending count, due amount, received amount)
- Electricity report with pagination and filters
- Proper user scoping on all queries

### Phase 7: Frontend — Layout & Auth Pages
- Global layout: dark sidebar, topbar with user menu
- Login page, Register page
- Auth context/provider, protected route wrapper
- API client with JWT interceptor

### Phase 8: Frontend — Dashboard
- Summary cards with month filter
- Due payments panel (tenant dropdown → due invoices table → inline payment)
- Quick invoice creation modal

### Phase 9: Frontend — Tenants
- Tenant list with React Table (search, sort, pagination)
- Create/Edit form with image upload, water charge toggle, advanced-paid checkbox
- Transaction history modal
- Delete with confirmation

### Phase 10: Frontend — Invoices
- Invoice list with React Table
- Create/Edit form with:
  - Tenant select (with data attributes for rent, water, room)
  - Month picker
  - Electricity units input → auto-fetch last units → auto-calc charge
  - Water charge (auto-populated from tenant config)
  - Total amount (auto-calculated, readonly)
  - Received amount, payment mode, payment date
  - Closer checkbox (create only), Exclude checkbox (edit only)
- PDF download button

### Phase 11: Frontend — Electricity Report
- Filter form (month, tenant)
- Paginated table
- Summary cards (total units, total cost)

### Phase 12: Frontend — Profile
- Edit name/email form
- Change password form

---

## Open Questions

> [!IMPORTANT]
> **PostgreSQL Database**: Should I create a new PostgreSQL database, or do you have an existing one you'd like to use? What credentials should I configure?

> [!IMPORTANT]
> **Data Migration**: Do you want to migrate existing data from the SQLite database to PostgreSQL, or start fresh?

> [!IMPORTANT]
> **Deployment**: Will this run on the same server (`/var/www/html/room-rent-manager-python`)? Should I set up Nginx reverse proxy configs for FastAPI (port 8000) and Next.js (port 3000)?

> [!IMPORTANT]
> **PDF Library**: Preference between `ReportLab` (pure Python, lighter) vs `WeasyPrint` (HTML/CSS to PDF, heavier but easier templating)?

---

## Verification Plan

### Automated Tests
- Backend: `pytest` with `httpx.AsyncClient` for all API endpoints
- Test auth flow (register → login → access protected routes)
- Test tenant CRUD with ownership enforcement
- Test invoice creation (verify total calculation, transaction logging)
- Test add-payment validation (reject negative, reject overpayment)
- Test PDF generation endpoint returns valid PDF bytes

### Manual Verification
- Run `uvicorn` backend and `npm run dev` frontend
- Walk through full flow: Register → Login → Add Tenant → Create Invoice → Add Payment → Download PDF
- Verify SA user sees all data, A user sees only own data
- Test electricity report filters and pagination
- Verify responsive design on mobile viewport
