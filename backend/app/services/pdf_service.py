import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from app.models.invoice import Invoice
from app.models.tenant import Tenant
from app.models.user import User

class PDFService:
    @staticmethod
    def generate_invoice_pdf(invoice: Invoice, tenant: Tenant, user: User) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            textColor=colors.HexColor("#1e3a8a"),
            alignment=1
        )
        elements.append(Paragraph("Room Rent Invoice", title_style))
        
        # Owner & Tenant Details Table
        data = [
            ["Owner Details", "Tenant Details"],
            [f"Name: {user.name}", f"Name: {tenant.name}"],
            [f"Email: {user.email}", f"Room No: {invoice.room_no}"],
            ["", f"Month: {invoice.month}"]
        ]
        
        t = Table(data, colWidths=[3*inch, 3*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f3f4f6")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.black),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('BACKGROUND', (0,1), (-1,-1), colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey)
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.5*inch))
        
        # Invoice Breakdown Table
        breakdown_data = [
            ["Description", "Amount (₹)"],
            ["Rent Amount", f"{invoice.rent_amount:.2f}"],
            [f"Electricity Charge ({invoice.electricity_units} units)", f"{invoice.electricity_charge:.2f}"],
            ["Water Charge", f"{invoice.water_charge:.2f}"],
        ]
        
        if getattr(invoice, "wifi_charge", 0) > 0:
            breakdown_data.append(["Wi-Fi Charge", f"{invoice.wifi_charge:.2f}"])

        if getattr(invoice, "advance_applied", 0) > 0:
            breakdown_data.append(["Advance Applied", f"-{invoice.advance_applied:.2f}"])
            
        breakdown_data.append(["Total Amount", f"{invoice.total_amount:.2f}"])

        if getattr(invoice, "wallet_adjustment", 0) > 0:
            breakdown_data.append(["Wallet Adjustment", f"-{invoice.wallet_adjustment:.2f}"])

        breakdown_data.extend([
            ["Received Amount", f"{invoice.received_amount:.2f}"],
            ["Due Amount", f"{(invoice.total_amount - invoice.received_amount - getattr(invoice, 'wallet_adjustment', 0)):.2f}"]
        ])
        
        total_idx = breakdown_data.index(next(row for row in breakdown_data if row[0] == "Total Amount"))
        due_idx = len(breakdown_data) - 1

        
        t2 = Table(breakdown_data, colWidths=[4*inch, 2*inch])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e5e7eb")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.black),
            ('ALIGN', (0,0), (0,-1), 'LEFT'),
            ('ALIGN', (1,0), (1,-1), 'RIGHT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTNAME', (0,total_idx), (-1,total_idx), 'Helvetica-Bold'),
            ('FONTNAME', (0,due_idx), (-1,due_idx), 'Helvetica-Bold')
        ]))
        elements.append(t2)
        
        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
