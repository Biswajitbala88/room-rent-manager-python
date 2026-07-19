import asyncio
from app.database import AsyncSessionLocal
from app.services.invoice_service import InvoiceService
from app.services.pdf_service import PDFService
from sqlalchemy.future import select
from app.models.invoice import Invoice

async def test_pdf():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Invoice.id).limit(1))
        invoice_id = res.scalar_one_or_none()
        if not invoice_id:
            print("No invoice found in database to test PDF generation.")
            return
            
        # Get admin/user to pass as current_user
        from app.models.user import User
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one()

        invoice = await InvoiceService.get_invoice(db, invoice_id, user)
        if not invoice:
            print("Invoice not found by service.")
            return
        
        tenant = invoice.tenant
        owner = tenant.owner if tenant else user
        print(f"Loaded tenant: {tenant.name if tenant else 'None'}")
        print(f"Loaded owner: {owner.name if owner else 'None'}")
        
        try:
            pdf_bytes = PDFService.generate_invoice_pdf(invoice, tenant, owner)
            print(f"Successfully generated PDF! Bytes length: {len(pdf_bytes)}")
        except Exception as e:
            print(f"Error generating PDF: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_pdf())
