"""One-off: set wifi_charge on invoices belonging to Wi-Fi tenants that were created
before Wi-Fi was enabled (or before the update-path bug was fixed), then recompute
total_amount/status with the same formula InvoiceService._rechain_room_invoices uses.

Only touches invoices where the tenant has has_wifi and the stored charge is 0, so it
is safe to re-run. Run it against whichever database DATABASE_URL points at -
production needs the same treatment as local, since those rows predate the fix.

Usage: python -m app.scratch.backfill_wifi_charges [--apply]   (default is a dry run)
"""
import asyncio
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.invoice import Invoice
from app.models.tenant import Tenant

APPLY = "--apply" in sys.argv


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Invoice, Tenant)
            .join(Tenant, Tenant.id == Invoice.tenant_id)
            .where(Tenant.has_wifi.is_(True), Invoice.wifi_charge == 0)
            .order_by(Tenant.name, Invoice.month)
        )).all()

        if not rows:
            print("Nothing to backfill.")
            return

        print(f"{'id':>5}  {'tenant':<16} {'month':<8} {'wifi':>8} {'total':>12} -> "
              f"{'wifi':>8} {'total':>12}  status")
        for invoice, tenant in rows:
            rate = Decimal(str(tenant.wifi_rate or 0))
            new_total = (
                invoice.rent_amount
                + invoice.electricity_charge
                + invoice.water_charge
                + rate
                - invoice.advance_applied
            )
            paid = invoice.received_amount + Decimal(str(invoice.wallet_adjustment or 0))
            new_status = "paid" if new_total <= paid else "unpaid"
            print(f"{invoice.id:>5}  {tenant.name:<16} {invoice.month:<8} "
                  f"{invoice.wifi_charge:>8} {invoice.total_amount:>12} -> "
                  f"{rate:>8} {new_total:>12}  {invoice.status} -> {new_status}")
            if APPLY:
                invoice.wifi_charge = rate
                invoice.total_amount = new_total
                invoice.status = new_status

        if APPLY:
            await db.commit()
            print(f"\nApplied to {len(rows)} invoice(s).")
        else:
            print(f"\nDry run: {len(rows)} invoice(s) would change. Re-run with --apply.")


asyncio.run(main())
