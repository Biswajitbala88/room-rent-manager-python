import asyncio
from decimal import Decimal
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.invoice import Invoice
from app.schemas.tenant import TenantCreate
from app.schemas.invoice import InvoiceCreate
from app.schemas.wallet_transaction import WalletTransactionCreate
from app.services.tenant_service import TenantService
from app.services.invoice_service import InvoiceService
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as db:
        # 1. Get an existing user/admin
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            print("No user found in the DB. Please seed the database first.")
            return
        print(f"Testing with user: {user.email}")

        # 2. Create a unique Room
        import random
        room_no = f"TEST-{random.randint(100, 999)}"
        room = Room(room_no=room_no, parent_id=user.id, rent_amount=5000.0, status="vacant")
        db.add(room)
        await db.commit()
        await db.refresh(room)
        print(f"Testing with unique Room: {room.room_no}")

        # 3. Create a new Tenant with wallet enabled and Wi-Fi active
        tenant_name = f"Test Tenant {random.randint(100, 999)}"
        tenant_data = TenantCreate(
            name=tenant_name,
            phone="1234567890",
            room_no=room.room_no,
            rent_amount=5000.0,
            is_water_charge=True,
            water_charge=200.0,
            has_wallet=True,
            has_wifi=True,
            wifi_rate=350.0,
            parent_id=user.id,
            manager_id=None
        )
        tenant = await TenantService.create_tenant(db, tenant_data, user)
        print(f"Created Tenant: {tenant.name} (has_wallet={tenant.has_wallet}, has_wifi={tenant.has_wifi}, wifi_rate={tenant.wifi_rate})")

        # 4. Try crediting some advance money to tenant's wallet
        wallet_credit = WalletTransactionCreate(
            amount=1500.0,
            transaction_type="credit",
            reason="Initial advance credit",
            reference="TXN12345"
        )
        wallet_tx = await TenantService.add_wallet_transaction(db, tenant.id, wallet_credit, user)
        print(f"Credited wallet: {wallet_tx.amount} (new running balance: {wallet_tx.running_balance})")

        # Refetch tenant to verify balance
        tenant_refetched = await TenantService.get_tenant(db, tenant.id, user)
        print(f"Tenant wallet balance verified: {tenant_refetched.wallet_balance}")

        # 5. Generate month-end invoice (automatically should include Wi-Fi rate)
        invoice_data = InvoiceCreate(
            tenant_id=tenant.id,
            month="2026-08",
            current_reading=100, # Electricity reading
            water_charge=200.0,
            received_amount=0.0,
            is_excluded=False,
            is_closer=False,
        )
        invoice = await InvoiceService.create_invoice(db, invoice_data, user)
        print(f"Generated Invoice:")
        print(f"  Rent Amount: {invoice.rent_amount}")
        print(f"  Wi-Fi Charge: {invoice.wifi_charge}")
        print(f"  Water Charge: {invoice.water_charge}")
        print(f"  Electricity Units/Charge: {invoice.electricity_units} / {invoice.electricity_charge}")
        print(f"  Total Amount: {invoice.total_amount}")
        print(f"  Wallet Adjustment: {invoice.wallet_adjustment}")
        print(f"  Status: {invoice.status}")

        # 6. Apply manual wallet adjustment to invoice
        adjust_amount = Decimal("850.00")
        adjusted_invoice = await InvoiceService.adjust_invoice_wallet(db, invoice.id, adjust_amount, user)
        print(f"After Wallet Adjustment of {adjust_amount}:")
        print(f"  Total Amount: {adjusted_invoice.total_amount}")
        print(f"  Wallet Adjustment: {adjusted_invoice.wallet_adjustment}")
        print(f"  Due Amount (Remaining): {adjusted_invoice.total_amount - adjusted_invoice.received_amount - adjusted_invoice.wallet_adjustment}")
        print(f"  Wallet Balance Before: {adjusted_invoice.wallet_balance_before}")
        print(f"  Wallet Balance After: {adjusted_invoice.wallet_balance_after}")
        print(f"  Status: {adjusted_invoice.status}")

        # Verify tenant balance after adjustment
        tenant_final = await TenantService.get_tenant(db, tenant.id, user)
        print(f"Final tenant wallet balance: {tenant_final.wallet_balance}")

        # 7. Add cash payment for remaining due
        remaining_due = adjusted_invoice.total_amount - adjusted_invoice.received_amount - adjusted_invoice.wallet_adjustment
        print(f"Paying remaining due: {remaining_due}")
        from app.schemas.invoice import AddPayment
        payment_data = AddPayment(
            amount=float(remaining_due),
            payment_mode="Cash",
            payment_date="2026-08-28"
        )
        paid_invoice = await InvoiceService.add_payment(db, invoice.id, payment_data, user)
        print(f"After Cash Payment of {remaining_due}:")
        print(f"  Received Amount: {paid_invoice.received_amount}")
        print(f"  Status: {paid_invoice.status}")

        # 8. Clean up created test tenant, invoice, and room
        await db.delete(paid_invoice)
        await db.delete(tenant_final)
        await db.delete(room)
        await db.commit()
        print("Cleaned up test data successfully.")

if __name__ == "__main__":
    asyncio.run(main())
