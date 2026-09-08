import io
import os
import re
from xml.sax.saxutils import escape
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.invoice import Invoice
from app.models.tenant import Tenant
from app.models.user import User

# Palette taken from the HTML invoice preview.
TEAL = colors.HexColor("#1b87a9")       # Total row
HEADER_BG = colors.HexColor("#eaeaea")  # Description/Amount header
ROW_BG = colors.HexColor("#f2f2f2")     # Paid/Due rows
BORDER = colors.HexColor("#c9c9c9")
TEXT = colors.black                     # Values + description text
GREEN = colors.HexColor("#008000")      # Paid
RED = colors.HexColor("#cc0000")        # Due

# Helvetica has no rupee glyph, so use a Unicode TTF when the host has one.
# Falls back to Helvetica + "Rs." so PDF generation never breaks on a bare image.
_BUNDLED_FONTS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")

_FONT_CANDIDATES = [
    # Bundled first: the Render build only runs `pip install`, so it cannot apt-get
    # a system font, and without one the rupee sign degrades to "Rs.".
    (os.path.join(_BUNDLED_FONTS, "DejaVuSans.ttf"),
     os.path.join(_BUNDLED_FONTS, "DejaVuSans-Bold.ttf")),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/TTF/DejaVuSans.ttf",
     "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
]

_FONT_STATE = None


def _fonts():
    """Return (regular, bold, rupee_symbol), registering a Unicode font once."""
    global _FONT_STATE
    if _FONT_STATE is None:
        _FONT_STATE = ("Helvetica", "Helvetica-Bold", "Rs.")
        for regular_path, bold_path in _FONT_CANDIDATES:
            if os.path.exists(regular_path) and os.path.exists(bold_path):
                try:
                    pdfmetrics.registerFont(TTFont("InvoiceSans", regular_path))
                    pdfmetrics.registerFont(TTFont("InvoiceSans-Bold", bold_path))
                    _FONT_STATE = ("InvoiceSans", "InvoiceSans-Bold", "₹")
                except Exception:
                    continue
                break
    return _FONT_STATE


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


def _month_label(month: str) -> str:
    """'2026-08' -> 'August 2026'. Anything unparseable is shown as-is."""
    try:
        return datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    except (TypeError, ValueError):
        return month or ""


def _slug(text: str) -> str:
    """'Reshma Gurung' -> 'reshma_gurung'. Anything non-alphanumeric collapses to
    a single underscore so the result is safe in a Content-Disposition header."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", (text or "").strip()).strip("_")
    return cleaned.lower() or "tenant"


class PDFService:
    @staticmethod
    def invoice_filename(invoice: Invoice, tenant: Tenant) -> str:
        """e.g. Invoice_reshma_gurung_2026-08.pdf"""
        name = _slug(tenant.name if tenant else "")
        month = invoice.month or "unknown"
        return f"Invoice_{name}_{month}.pdf"

    @staticmethod
    def generate_invoice_pdf(invoice: Invoice, tenant: Tenant, user: User) -> bytes:
        font, bold, rupee = _fonts()

        def money(value) -> str:
            return f"{rupee}{_dec(value):,.2f}"

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=0.9 * inch,
            rightMargin=0.9 * inch,
            topMargin=0.9 * inch,
            bottomMargin=0.9 * inch,
        )
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "InvoiceTitle", parent=styles["Heading1"], fontName=bold,
            fontSize=18, leading=22, alignment=TA_CENTER, spaceAfter=0,
            textColor=colors.black,
        )
        meta_style = ParagraphStyle(
            "InvoiceMeta", parent=styles["Normal"], fontName=font,
            fontSize=10, leading=18, textColor=TEXT,
        )
        cell_style = ParagraphStyle(
            "InvoiceCell", parent=styles["Normal"], fontName=font,
            fontSize=9.5, leading=13, textColor=TEXT,
        )
        note_style = ParagraphStyle(
            "InvoiceCellNote", parent=cell_style, fontSize=8.5, leading=12,
        )
        footer_style = ParagraphStyle(
            "InvoiceFooter", parent=styles["Normal"], fontName=font,
            fontSize=8.5, leading=13, alignment=TA_CENTER, textColor=TEXT,
        )

        def label(text: str, value: str) -> Paragraph:
            return Paragraph(
                f'<font name="{bold}" color="#000000">{text}:</font> {escape(value)}',
                meta_style,
            )

        elements = [
            Paragraph("Invoice", title_style),
            Spacer(1, 0.32 * inch),
            label("Name", tenant.name if tenant else "-"),
            label("Room No", str(invoice.room_no or "-")),
            label("Month", _month_label(invoice.month)),
            Spacer(1, 0.16 * inch),
        ]

        # --- Charge breakdown ------------------------------------------------
        units = int(invoice.electricity_units or 0)
        previous = int(invoice.previous_reading or 0)
        current = int(invoice.current_reading or 0)
        electricity_charge = _dec(invoice.electricity_charge)
        rate = (electricity_charge / units) if units else Decimal("0")
        # A whole-number rate reads better without the trailing ".00" (e.g. "x Rs.10").
        rate_text = f"{rate:,.0f}" if rate == rate.to_integral_value() else f"{rate:,.2f}"

        electricity_cell = [
            Paragraph(
                f"Electricity Usage: {current} - {previous} = {units} units", cell_style
            )
        ]
        if units:
            electricity_cell.append(
                Paragraph(
                    f"Charge = ({current} - {previous} = {units}) &#215; "
                    f"{rupee}{rate_text} = {money(electricity_charge)}",
                    note_style,
                )
            )

        rows = [
            ["Description", "Amount"],
            [Paragraph("Monthly Rent", cell_style), money(invoice.rent_amount)],
            [electricity_cell, money(electricity_charge)],
            [Paragraph("Water Charge", cell_style), money(invoice.water_charge)],
        ]

        if _dec(getattr(invoice, "wifi_charge", 0)) > 0:
            rows.append(
                [Paragraph("Wi-Fi Charge", cell_style), money(invoice.wifi_charge)]
            )

        advance = _dec(getattr(invoice, "advance_applied", 0))
        if advance > 0:
            rows.append(
                [Paragraph("Advance Applied", cell_style), f"-{money(advance)}"]
            )

        total = _dec(invoice.total_amount)
        rows.append(["Total", money(total)])
        total_idx = len(rows) - 1

        wallet = _dec(getattr(invoice, "wallet_adjustment", 0))
        wallet_idx = None
        if wallet > 0:
            rows.append([Paragraph("Wallet Adjustment", cell_style), f"-{money(wallet)}"])
            wallet_idx = len(rows) - 1

        paid = _dec(invoice.received_amount) + wallet
        due = total - paid

        rows.append(["Paid", money(paid)])
        paid_idx = len(rows) - 1
        rows.append(["Due", money(due)])
        due_idx = len(rows) - 1

        table = Table(rows, colWidths=[4.5 * inch, 1.9 * inch], hAlign="LEFT")
        style = [
            ("FONTNAME", (0, 0), (-1, -1), font),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("GRID", (0, 0), (-1, -1), 0.6, BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("FONTNAME", (0, 0), (-1, 0), bold),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            # Total row
            ("BACKGROUND", (0, total_idx), (-1, total_idx), TEAL),
            ("FONTNAME", (0, total_idx), (-1, total_idx), bold),
            ("TEXTCOLOR", (0, total_idx), (-1, total_idx), colors.white),
            # Paid / Due summary rows
            ("BACKGROUND", (0, paid_idx), (-1, due_idx), ROW_BG),
            ("FONTNAME", (0, paid_idx), (-1, due_idx), bold),
            ("TEXTCOLOR", (0, paid_idx), (0, due_idx), colors.black),
            ("TEXTCOLOR", (1, paid_idx), (1, paid_idx), GREEN),
            ("TEXTCOLOR", (1, due_idx), (1, due_idx), RED if due > 0 else GREEN),
        ]
        if wallet_idx is not None:
            style.append(("BACKGROUND", (0, wallet_idx), (-1, wallet_idx), colors.white))
        table.setStyle(TableStyle(style))
        elements.append(table)

        # --- Status + footer -------------------------------------------------
        is_paid = due <= 0
        status_text = "Paid" if is_paid else "Due"
        status_color = GREEN if is_paid else RED
        elements.append(Spacer(1, 0.18 * inch))
        elements.append(
            Paragraph(
                f'<font name="{bold}" color="#000000">Status:</font> '
                f'<font name="{bold}" color="#{status_color.hexval()[2:]}">'
                f"&nbsp;{status_text}</font>",
                meta_style,
            )
        )
        elements.append(Spacer(1, 0.3 * inch))
        elements.append(
            HRFlowable(width="100%", thickness=0.8, color=BORDER, dash=(2, 3))
        )
        elements.append(Spacer(1, 0.14 * inch))
        elements.append(Paragraph("Thank you for staying with us!", footer_style))
        elements.append(Paragraph("This is a computer-generated invoice.", footer_style))

        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
