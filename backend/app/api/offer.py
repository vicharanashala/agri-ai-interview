from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from io import BytesIO
from datetime import datetime
import base64
import uuid

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from app.db.database import SessionLocal
from app.db.models.candidate import Candidate, SignedOfferLetter, User
from app.services.settings_service import get_offer_letter_config

router = APIRouter(prefix="/api", tags=["offer"])


def generate_offer_letter_pdf(
    candidate_name: str,
    email: str,
    phone: str,
    config: dict | None = None,
    signed: bool = False,
    signature_name: str | None = None,
    signed_at: datetime | None = None,
) -> BytesIO:
    """
    Generate an offer letter PDF.

    When signed=True, the acceptance section includes the candidate's name and
    the date the offer was accepted — these replace the blank signature lines.
    """
    if config is None:
        config = get_offer_letter_config()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=20,
        alignment=1,
        spaceAfter=20,
        textColor=colors.HexColor("#2E7D32"),
    )

    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=14,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor("#1B5E20"),
    )

    body_style = ParagraphStyle(
        "CustomBody",
        parent=styles["Normal"],
        fontSize=11,
        spaceBefore=6,
        spaceAfter=6,
        leading=16,
    )

    footer_style = ParagraphStyle(
        "Footer",
        parent=body_style,
        fontSize=9,
        textColor=colors.gray,
        alignment=1,
    )

    elements = []

    # ── Company Header ────────────────────────────────────────────────────────
    company_name = config.get("companyName", "ANNAM AGRITECH")
    company_tagline = config.get("companyTagline", "Empowering Agriculture Through Technology")

    elements.append(Paragraph(f"<b>{company_name}</b>", title_style))
    elements.append(
        Paragraph(
            f"<i>{company_tagline}</i>",
            ParagraphStyle("Subtitle", parent=body_style, alignment=1),
        )
    )
    elements.append(Spacer(1, 30))

    # ── Date ──────────────────────────────────────────────────────────────────
    date_str = datetime.now().strftime("%B %d, %Y")
    elements.append(Paragraph(f"Date: {date_str}", body_style))
    elements.append(Spacer(1, 20))

    # ── Subject ───────────────────────────────────────────────────────────────
    position = config.get("position", "Agri Expert Intern")
    elements.append(
        Paragraph(f"<b>Subject: Offer Letter for {position}</b>", heading_style)
    )
    elements.append(Spacer(1, 15))

    # ── Greeting ──────────────────────────────────────────────────────────────
    elements.append(Paragraph(f"Dear {candidate_name},", body_style))
    elements.append(Spacer(1, 10))

    # ── Offer paragraph ───────────────────────────────────────────────────────
    offer_text = (
        f"We are pleased to inform you that after careful consideration of your application and "
        f"interview performance, we are delighted to offer you the position of <b>{position}</b> "
        f"at {company_name}. This internship program is designed to provide hands-on experience "
        f"in agricultural consulting and technology solutions."
    )
    elements.append(Paragraph(offer_text, body_style))
    elements.append(Spacer(1, 15))

    # ── Internship Details Table ──────────────────────────────────────────────
    department = config.get("department", "Agricultural Advisory Services")
    duration = config.get("duration", "6 months (extendable based on performance)")
    stipend = config.get("stipend", "₹15,000/month")
    location = config.get("location", "Hybrid (Remote + On-site training)")
    start_date_note = config.get("startDateNote", "To be confirmed upon acceptance")

    details_data = [
        ["Position:", position],
        ["Department:", department],
        ["Duration:", duration],
        ["Stipend:", stipend],
        ["Location:", location],
        ["Start Date:", start_date_note],
    ]

    table = Table(details_data, colWidths=[2 * inch, 4 * inch])
    table.setStyle(
        TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    elements.append(table)
    elements.append(Spacer(1, 20))

    # ── Responsibilities ──────────────────────────────────────────────────────
    responsibilities = config.get(
        "responsibilities",
        [
            "Provide expert consultation on crop management and agricultural practices",
            "Assist in developing technology solutions for farming challenges",
            "Conduct research on modern agricultural techniques and trends",
            "Support farmers with data-driven insights for improved yield",
            "Collaborate with the tech team to translate agricultural expertise into scalable solutions",
        ],
    )
    elements.append(Paragraph("<b>Key Responsibilities:</b>", heading_style))
    for resp in responsibilities:
        elements.append(Paragraph(f"• {resp}", body_style))
    elements.append(Spacer(1, 15))

    # ── Terms & Conditions ────────────────────────────────────────────────────
    terms = config.get(
        "terms",
        [
            "This internship offer is contingent upon successful completion of any pending documentation.",
            "The intern agrees to maintain confidentiality regarding company information and proprietary data.",
            "Performance will be evaluated periodically, and continuation of the internship depends on satisfactory performance.",
            "The intern must comply with all company policies and agricultural safety guidelines.",
            "This offer must be signed and returned within 7 days of receipt.",
        ],
    )
    elements.append(Paragraph("<b>Terms and Conditions:</b>", heading_style))
    for i, term in enumerate(terms, 1):
        elements.append(Paragraph(f"{i}. {term}", body_style))
    elements.append(Spacer(1, 20))

    # ── Candidate Contact Information ─────────────────────────────────────────
    elements.append(Paragraph("<b>Your Information:</b>", heading_style))
    contact_info = (
        f"<b>Name:</b> {candidate_name}<br/>"
        f"<b>Email:</b> {email}<br/>"
        f"<b>Phone:</b> {phone}"
    )
    elements.append(Paragraph(contact_info, body_style))
    elements.append(Spacer(1, 25))

    # ── Closing paragraph ─────────────────────────────────────────────────────
    closing_text = (
        f"We are excited about the prospect of you joining our team and believe you will be "
        f"a valuable addition to {company_name}. If you have any questions or need further "
        f"clarification, please do not hesitate to contact us."
    )
    elements.append(Paragraph(closing_text, body_style))
    elements.append(Spacer(1, 30))

    # ── Acceptance Section ────────────────────────────────────────────────────
    accept_by_days = config.get("acceptByDays", 7)
    elements.append(Paragraph("<b>Acceptance of Offer:</b>", heading_style))
    elements.append(
        Paragraph(f"This offer must be signed within next {accept_by_days} days.", body_style)
    )
    elements.append(Spacer(1, 20))

    # ── Signature / Acceptance lines ──────────────────────────────────────────
    # Unsigned: show blank underscores
    # Signed: bake candidate name + actual date into the acceptance block
    if signed and signature_name and signed_at:
        sign_date_str = signed_at.strftime("%B %d, %Y")
        elements.append(
            Paragraph(
                f"<b>Accepted By:</b>&nbsp;&nbsp;{signature_name}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                f"<b>Date:</b>&nbsp;&nbsp;{sign_date_str}",
                body_style,
            )
        )
    else:
        signature_label = config.get("signatureLabel", "Candidate Signature")
        elements.append(
            Paragraph(
                "_________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                "_________________________",
                body_style,
            )
        )
        elements.append(
            Paragraph(
                f"{signature_label}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date",
                body_style,
            )
        )
    elements.append(Spacer(1, 40))

    # ── Footer ────────────────────────────────────────────────────────────────
    footer_text = config.get(
        "footerText",
        "Annam AgriTech | Agricultural Innovation Hub | www.annmagritech.com",
    )
    elements.append(Paragraph(footer_text, footer_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer


# ── Public config (no auth) ────────────────────────────────────────────────────

@router.get("/public/offer-letter-config")
async def get_public_offer_letter_config():
    """Return position / location / stipend — no auth required."""
    config = get_offer_letter_config()
    return {
        "position": config.get("position", "Agri Expert Intern"),
        "location": config.get("location", "Hybrid (Remote + On-site training)"),
        "stipend": config.get("stipend", "₹15,000/month"),
    }


# ── Unsigned offer letter (existing public endpoint) ──────────────────────────

@router.get("/offer-letter")
async def get_offer_letter(
    name: str = Query(..., description="Candidate full name"),
    email: str = Query(..., description="Candidate email"),
    phone: str = Query(..., description="Candidate phone number"),
    action: str = Query("view", description="Action: 'view' or 'download'"),
):
    """Generate and serve an unsigned offer letter PDF."""
    try:
        pdf_buffer = generate_offer_letter_pdf(
            candidate_name=name,
            email=email,
            phone=phone,
        )

        headers = (
            {"Content-Disposition": f"attachment; filename=Offer_Letter_{name.replace(' ', '_')}.pdf"}
            if action == "download"
            else {"Content-Disposition": "inline; filename=Offer_Letter.pdf"}
        )
        return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate offer letter: {str(e)}")


# ── Signed offer letter endpoints ─────────────────────────────────────────────

class SignOfferLetterRequest(BaseModel):
    signatureName: str
    signedAt: datetime | None = None


@router.post("/signed-offer-letter")
async def create_signed_offer_letter(
    body: SignOfferLetterRequest,
    candidate_id: str | None = Query(None, description="Candidate ID (from session if not provided)"),
):
    """
    Generate the signed offer letter PDF, persist it to the DB, and return it.

    The candidate must have an active session.  Candidate data is resolved from
    the candidate_id query param.
    """
    if not candidate_id:
        raise HTTPException(status_code=400, detail="candidate_id is required")

    signed_at = body.signedAt or datetime.utcnow()

    # Resolve candidate email from DB
    db = SessionLocal()
    try:
        candidate: Candidate | None = db.query(Candidate).filter(
            Candidate.id == candidate_id
        ).first()

        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Email lives on the User model, not Candidate
        user_email = ""
        if candidate.userId:
            user: User | None = db.query(User).filter(User.id == candidate.userId).first()
            if user and user.email:
                user_email = user.email

        email = user_email
        candidate_name = candidate.fullName or ""

        pdf_buffer = generate_offer_letter_pdf(
            candidate_name=candidate_name,
            email=email,
            phone=candidate.phone or "",
            signed=True,
            signature_name=body.signatureName,
            signed_at=signed_at,
        )

        pdf_bytes = pdf_buffer.read()
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

        record = SignedOfferLetter(
            id=uuid.uuid4().hex,
            candidateId=candidate_id,
            pdfData=pdf_b64,
            signatureName=body.signatureName,
            signedAt=signed_at,
        )
        db.add(record)
        db.commit()

        return JSONResponse({
            "id": record.id,
            "candidateId": candidate_id,
            "signatureName": body.signatureName,
            "signedAt": signed_at.isoformat(),
            "message": "Offer letter signed and stored successfully",
        })
    finally:
        db.close()


@router.get("/signed-offer-letter/{candidate_id}")
async def get_signed_offer_letter(candidate_id: str):
    """
    Retrieve the stored signed offer letter PDF for a candidate.
    """
    db = SessionLocal()
    try:
        record: SignedOfferLetter | None = db.query(SignedOfferLetter).filter(
            SignedOfferLetter.candidateId == candidate_id
        ).first()

        if not record:
            raise HTTPException(status_code=404, detail="Signed offer letter not found")

        # pdfData stored as base64-encoded PDF bytes in bytea col
        pdf_bytes = base64.b64decode(bytes(record.pdfData))
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=Signed_Offer_Letter_{record.signatureName.replace(' ', '_')}.pdf"
            },
        )
    finally:
        db.close()