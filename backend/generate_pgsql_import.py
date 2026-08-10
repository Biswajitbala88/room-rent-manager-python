#!/usr/bin/env python3
"""
Generate PostgreSQL data-only import SQL from MySQL export.

Maps the old MySQL/Laravel schema to the new FastAPI/PostgreSQL schema:
- users: password -> password_hash, drops remember_token, adds parent_id
- tenants: aadhaar_image (text) -> aadhaar_images (json), adds manager_id, advance_amount
- invoices: adds rent_amount, previous_reading, current_reading, is_closer, advance_applied
- transactions: kept as-is (drops updated_at)
- rooms: generated from distinct tenant room_no values
"""

import re
import json
from datetime import datetime

MYSQL_FILE = "/var/www/html/room_rent_manager/database/data/mysql_import.sql"
OUTPUT_FILE = "/var/www/html/room-rent-manager-python/backend/pgsql_data_import.sql"

# Default bcrypt hash for migrated users (placeholder - they'll need to reset password)
# This is bcrypt hash of "changeme123"
DEFAULT_PASSWORD_HASH = "$2b$12$LJ3m4ys3Lk0kXx0z0z0z0uKQKQKQKQKQKQKQKQKQKQKQKQKQKQKQK"


def parse_inserts(sql_text, table_name):
    """Parse INSERT statements for a given table and return list of dicts."""
    pattern = rf"INSERT INTO `{table_name}` \(([^)]+)\) VALUES \(([^)]+)\);"
    rows = []
    for match in re.finditer(pattern, sql_text):
        cols = [c.strip().strip('`') for c in match.group(1).split(',')]
        # Parse values carefully (handles quoted strings with commas)
        raw_vals = match.group(2)
        vals = []
        current = ""
        in_quote = False
        escape_next = False
        for ch in raw_vals:
            if escape_next:
                current += ch
                escape_next = False
                continue
            if ch == '\\':
                escape_next = True
                current += ch
                continue
            if ch == "'" and not in_quote:
                in_quote = True
                continue
            elif ch == "'" and in_quote:
                in_quote = False
                continue
            elif ch == ',' and not in_quote:
                vals.append(current.strip())
                current = ""
                continue
            current += ch
        vals.append(current.strip())

        row = {}
        for i, col in enumerate(cols):
            val = vals[i] if i < len(vals) else "NULL"
            row[col] = val
        rows.append(row)
    return rows


def sql_str(val):
    """Escape a string value for PostgreSQL."""
    if val == "NULL" or val is None:
        return "NULL"
    # Escape single quotes
    escaped = val.replace("'", "''")
    return f"'{escaped}'"


def sql_bool(val):
    """Convert MySQL tinyint to PostgreSQL boolean."""
    if val == "NULL" or val is None:
        return "false"
    return "true" if val in ("1", "true", "True") else "false"


def sql_num(val, default="0"):
    """Ensure numeric value."""
    if val == "NULL" or val is None or val == "":
        return default
    return val


def sql_ts(val):
    """Convert datetime string to PostgreSQL timestamp."""
    if val == "NULL" or val is None:
        return "NULL"
    return f"'{val}+05:30'"


def sql_date(val):
    """Convert date string."""
    if val == "NULL" or val is None:
        return "NULL"
    return f"'{val}'"


def convert_aadhaar(val):
    """Convert MySQL aadhaar_image text to PostgreSQL JSON array."""
    if val == "NULL" or val is None or val == "":
        return "'[]'::json"
    try:
        # The value has escaped quotes and backslashes from MySQL
        # Clean up the escaping
        cleaned = val.replace('\\"', '"').replace('\\\\', '\\')
        # Try to parse as JSON
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            json_str = json.dumps(parsed)
            return f"'{json_str}'::json"
    except (json.JSONDecodeError, Exception):
        pass
    return "'[]'::json"


def main():
    with open(MYSQL_FILE, 'r') as f:
        sql_text = f.read()

    users = parse_inserts(sql_text, 'users')
    tenants = parse_inserts(sql_text, 'tenants')
    invoices = parse_inserts(sql_text, 'invoices')
    transactions = parse_inserts(sql_text, 'transactions')

    lines = []
    lines.append("-- ============================================")
    lines.append("-- Room Rent Manager - PostgreSQL Data Import")
    lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("-- Source: MySQL export (mysql_import.sql)")
    lines.append("-- Target: FastAPI PostgreSQL schema")
    lines.append("-- ============================================")
    lines.append("")
    lines.append("-- IMPORTANT: Run Alembic migrations FIRST to create the schema")
    lines.append("-- Then run this file to import data:")
    lines.append("--   psql -h <host> -U <user> -d <db> -f pgsql_data_import.sql")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # ---- USERS ----
    lines.append("-- ============================================")
    lines.append("-- USERS")
    lines.append("-- ============================================")
    lines.append("-- NOTE: Passwords are kept from Laravel (bcrypt $2y$).")
    lines.append("-- passlib bcrypt accepts $2y$ hashes. Users can login with old passwords.")
    lines.append("")

    for u in users:
        uid = u['id']
        name = sql_str(u['name'])
        email = sql_str(u['email'])
        email_verified = sql_ts(u.get('email_verified_at', 'NULL'))
        # Keep original Laravel bcrypt hash - passlib accepts $2y$
        pw_hash = sql_str(u['password'])
        user_type = sql_str(u.get('user_type', 'A'))
        created = sql_ts(u.get('created_at', 'NULL'))
        updated = sql_ts(u.get('updated_at', 'NULL'))

        lines.append(
            f"INSERT INTO users (id, parent_id, name, email, email_verified_at, password_hash, user_type, created_at, updated_at) "
            f"VALUES ({uid}, NULL, {name}, {email}, {email_verified}, {pw_hash}, {user_type}, {created}, {updated});"
        )

    lines.append("")

    # ---- TENANTS ----
    lines.append("-- ============================================")
    lines.append("-- TENANTS")
    lines.append("-- ============================================")
    lines.append("")

    for t in tenants:
        tid = t['id']
        parent_id = sql_num(t.get('parent_id', '2'), '2')
        name = sql_str(t['name'])
        phone = sql_str(t.get('phone', 'NULL'))
        room_no = sql_str(t.get('room_no', 'NULL'))
        start_date = sql_date(t.get('start_date', 'NULL'))
        rent_amount = sql_num(t.get('rent_amount', '5000'))
        aadhaar = convert_aadhaar(t.get('aadhaar_image', 'NULL'))
        status = sql_str(t.get('status', 'active'))
        is_water = sql_bool(t.get('is_water_charge', '0'))
        water_charge = sql_num(t.get('water_charge', '0'))
        is_advanced = sql_bool(t.get('is_advanced', '0'))
        created = sql_ts(t.get('created_at', 'NULL'))
        updated = sql_ts(t.get('updated_at', 'NULL'))

        lines.append(
            f"INSERT INTO tenants (id, parent_id, manager_id, name, phone, room_no, start_date, rent_amount, "
            f"aadhaar_images, status, is_water_charge, water_charge, is_advanced, advance_amount, created_at, updated_at) "
            f"VALUES ({tid}, {parent_id}, NULL, {name}, {phone}, {room_no}, {start_date}, {rent_amount}, "
            f"{aadhaar}, {status}, {is_water}, {water_charge}, {is_advanced}, 0, {created}, {updated});"
        )

    lines.append("")

    # ---- INVOICES ----
    lines.append("-- ============================================")
    lines.append("-- INVOICES")
    lines.append("-- NOTE: rent_amount defaults to 5000 (standard rent)")
    lines.append("-- previous_reading and current_reading default to 0 (not in old schema)")
    lines.append("-- ============================================")
    lines.append("")

    # Build a tenant lookup for rent_amount
    tenant_rent = {}
    for t in tenants:
        tenant_rent[t['id']] = t.get('rent_amount', '5000')

    for inv in invoices:
        iid = inv['id']
        tenant_id = inv['tenant_id']
        room_no = sql_str(inv.get('room_no', 'NULL'))
        month = sql_str(inv['month'])
        elec_units = sql_num(inv.get('electricity_units', '0'))
        elec_charge = sql_num(inv.get('electricity_charge', '0'))
        water_charge = sql_num(inv.get('water_charge', '0'))
        rent = sql_num(tenant_rent.get(tenant_id, '5000'))
        total = sql_num(inv.get('total_amount', '0'))
        received = sql_num(inv.get('received_amount', '0'))
        is_excluded = sql_bool(inv.get('is_excluded', '0'))
        status = sql_str(inv.get('status', 'unpaid'))
        created = sql_ts(inv.get('created_at', 'NULL'))
        updated = sql_ts(inv.get('updated_at', 'NULL'))

        lines.append(
            f"INSERT INTO invoices (id, tenant_id, room_no, month, electricity_units, previous_reading, current_reading, "
            f"electricity_charge, water_charge, rent_amount, total_amount, received_amount, is_excluded, is_closer, "
            f"advance_applied, status, created_at, updated_at) "
            f"VALUES ({iid}, {tenant_id}, {room_no}, {month}, {elec_units}, 0, 0, "
            f"{elec_charge}, {water_charge}, {rent}, {total}, {received}, {is_excluded}, false, "
            f"0, {status}, {created}, {updated});"
        )

    lines.append("")

    # ---- TRANSACTIONS ----
    lines.append("-- ============================================")
    lines.append("-- TRANSACTIONS")
    lines.append("-- ============================================")
    lines.append("")

    for tx in transactions:
        txid = tx['id']
        tenant_id = tx['tenant_id']
        invoice_id = sql_num(tx.get('invoice_id', 'NULL'))
        if invoice_id == 'NULL':
            invoice_id_sql = 'NULL'
        else:
            invoice_id_sql = invoice_id
        amount = sql_num(tx['amount'])
        pay_mode = sql_str(tx.get('payment_mode', 'NULL'))
        pay_date = sql_date(tx.get('payment_date', 'NULL'))
        created = sql_ts(tx.get('created_at', 'NULL'))

        lines.append(
            f"INSERT INTO transactions (id, tenant_id, invoice_id, amount, payment_mode, payment_date, created_at) "
            f"VALUES ({txid}, {tenant_id}, {invoice_id_sql}, {amount}, {pay_mode}, {pay_date}, {created});"
        )

    lines.append("")

    # ---- ROOMS (generated from tenant data) ----
    lines.append("-- ============================================")
    lines.append("-- ROOMS (generated from tenant room assignments)")
    lines.append("-- ============================================")
    lines.append("")

    # Collect unique room numbers with their owner (parent_id=2 for all)
    seen_rooms = {}
    for t in tenants:
        rno = t.get('room_no', '')
        if rno and rno != 'NULL' and rno not in seen_rooms:
            seen_rooms[rno] = {
                'parent_id': t.get('parent_id', '2'),
                'rent_amount': t.get('rent_amount', '5000'),
                'status': 'occupied' if t.get('status') == 'active' else 'vacant'
            }

    room_id = 1
    for rno in sorted(seen_rooms.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        info = seen_rooms[rno]
        # Check if any active tenant is in this room
        active_in_room = any(
            t.get('room_no') == rno and t.get('status') == 'active'
            for t in tenants
        )
        status = 'occupied' if active_in_room else 'vacant'

        lines.append(
            f"INSERT INTO rooms (id, parent_id, room_no, rent_amount, description, status, created_at, updated_at) "
            f"VALUES ({room_id}, {info['parent_id']}, '{rno}', {info['rent_amount']}, NULL, '{status}', now(), now());"
        )
        room_id += 1

    lines.append("")

    # ---- SEQUENCE RESETS ----
    lines.append("-- ============================================")
    lines.append("-- RESET SEQUENCES")
    lines.append("-- (so new inserts get correct auto-increment IDs)")
    lines.append("-- ============================================")
    lines.append("")

    max_user = max(int(u['id']) for u in users) if users else 1
    max_tenant = max(int(t['id']) for t in tenants) if tenants else 1
    max_invoice = max(int(i['id']) for i in invoices) if invoices else 1
    max_tx = max(int(t['id']) for t in transactions) if transactions else 1

    lines.append(f"SELECT setval('users_id_seq', {max_user});")
    lines.append(f"SELECT setval('tenants_id_seq', {max_tenant});")
    lines.append(f"SELECT setval('invoices_id_seq', {max_invoice});")
    lines.append(f"SELECT setval('transactions_id_seq', {max_tx});")
    lines.append(f"SELECT setval('rooms_id_seq', {room_id - 1});")
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- ============================================")
    lines.append("-- DONE! Verify with:")
    lines.append("--   SELECT count(*) FROM users;")
    lines.append("--   SELECT count(*) FROM tenants;")
    lines.append("--   SELECT count(*) FROM invoices;")
    lines.append("--   SELECT count(*) FROM transactions;")
    lines.append("--   SELECT count(*) FROM rooms;")
    lines.append("-- ============================================")

    with open(OUTPUT_FILE, 'w') as f:
        f.write('\n'.join(lines))

    print(f"Generated: {OUTPUT_FILE}")
    print(f"  Users:        {len(users)}")
    print(f"  Tenants:      {len(tenants)}")
    print(f"  Invoices:     {len(invoices)}")
    print(f"  Transactions: {len(transactions)}")
    print(f"  Rooms:        {room_id - 1}")


if __name__ == "__main__":
    main()
