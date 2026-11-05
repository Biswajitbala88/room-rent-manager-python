from decimal import Decimal
from types import SimpleNamespace
from app.services.pdf_service import PDFService

def test_pdf_with_previous_dues():
    # Scenario: Current invoice is for October 2026, total 3500, paid 0 (due 3500)
    # Previous due is July 2026 with due 850
    inv = SimpleNamespace(
        id=101,
        room_no="2",
        month="2026-10",
        electricity_units=50,
        previous_reading=100,
        current_reading=150,
        electricity_charge=Decimal("400.00"),
        water_charge=Decimal("100.00"),
        rent_amount=Decimal("3000.00"),
        total_amount=Decimal("3500.00"),
        received_amount=Decimal("0.00"),
        advance_applied=Decimal("0.00"),
        wifi_charge=Decimal("0.00"),
        wallet_adjustment=Decimal("0.00"),
    )
    tenant = SimpleNamespace(name="John Doe", has_wifi=False)
    user = SimpleNamespace(name="Owner User")

    # 1. Test without previous dues
    pdf_single = PDFService.generate_invoice_pdf(inv, tenant, user)
    assert len(pdf_single) > 1000, "Single invoice PDF generation failed"
    print(f"✓ Single invoice PDF generated successfully ({len(pdf_single)} bytes)")

    # 2. Test with single previous due (July 2026: 850)
    previous_dues = [
        {"id": 99, "month": "2026-07", "due_amount": Decimal("850.00")}
    ]
    pdf_with_prev = PDFService.generate_invoice_pdf(inv, tenant, user, previous_dues=previous_dues)
    assert len(pdf_with_prev) > 1000, "PDF with previous due generation failed"
    print(f"✓ PDF with 1 previous due (July: ₹850) generated successfully ({len(pdf_with_prev)} bytes)")

    # 3. Test with multiple previous dues (May 2026: 500, July 2026: 850)
    multiple_dues = [
        {"id": 98, "month": "2026-05", "due_amount": Decimal("500.00")},
        {"id": 99, "month": "2026-07", "due_amount": Decimal("850.00")}
    ]
    pdf_multiple = PDFService.generate_invoice_pdf(inv, tenant, user, previous_dues=multiple_dues)
    assert len(pdf_multiple) > 1000, "PDF with multiple previous dues generation failed"
    print(f"✓ PDF with multiple previous dues generated successfully ({len(pdf_multiple)} bytes)")

    # 4. Test when current invoice is fully paid, but previous invoice is due
    inv_paid = SimpleNamespace(
        id=102,
        room_no="2",
        month="2026-10",
        electricity_units=50,
        previous_reading=100,
        current_reading=150,
        electricity_charge=Decimal("400.00"),
        water_charge=Decimal("100.00"),
        rent_amount=Decimal("3000.00"),
        total_amount=Decimal("3500.00"),
        received_amount=Decimal("3500.00"),
        advance_applied=Decimal("0.00"),
        wifi_charge=Decimal("0.00"),
        wallet_adjustment=Decimal("0.00"),
    )
    pdf_paid_with_prev = PDFService.generate_invoice_pdf(inv_paid, tenant, user, previous_dues=previous_dues)
    assert len(pdf_paid_with_prev) > 1000, "PDF with paid current and due prev failed"
    print(f"✓ PDF with paid current month and due July generated successfully ({len(pdf_paid_with_prev)} bytes)")

if __name__ == "__main__":
    test_pdf_with_previous_dues()
    print("All PDF previous dues tests passed successfully!")
