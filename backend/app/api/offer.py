from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

router = APIRouter(prefix="/api", tags=["offer"])


def generate_offer_letter_pdf(
    candidate_name: str,
    email: str,
    phone: str,
) -> BytesIO:
    """Generate a professional offer letter PDF for Agri Expert Internship."""
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    # Create styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        alignment=1,  # Center
        spaceAfter=20,
        textColor=colors.HexColor('#2E7D32')  # Green color for agri theme
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor('#1B5E20')
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        spaceBefore=6,
        spaceAfter=6,
        leading=16
    )
    
    elements = []
    
    # Company Header
    elements.append(Paragraph("<b>ANNAM AGRITECH</b>", title_style))
    elements.append(Paragraph("<i>Empowering Agriculture Through Technology</i>", 
                              ParagraphStyle('Subtitle', parent=body_style, alignment=1)))
    elements.append(Spacer(1, 30))
    
    # Date
    date_str = datetime.now().strftime("%B %d, %Y")
    elements.append(Paragraph(f"Date: {date_str}", body_style))
    elements.append(Spacer(1, 20))
    
    # Subject
    elements.append(Paragraph("<b>Subject: Offer Letter for Agri Expert Internship</b>", heading_style))
    elements.append(Spacer(1, 15))
    
    # Greeting
    elements.append(Paragraph(f"Dear {candidate_name},", body_style))
    elements.append(Spacer(1, 10))
    
    # Offer details
    offer_text = """
    We are pleased to inform you that after careful consideration of your application and interview performance, 
    we are delighted to offer you the position of <b>Agri Expert Intern</b> at Annam AgriTech. This internship 
    program is designed to provide hands-on experience in agricultural consulting and technology solutions.
    """
    elements.append(Paragraph(offer_text, body_style))
    elements.append(Spacer(1, 15))
    
    # Terms Table
    elements.append(Paragraph("<b>Internship Details:</b>", heading_style))
    
    data = [
        ["Position:", "Agri Expert Intern"],
        ["Department:", "Agricultural Advisory Services"],
        ["Duration:", "6 months (extendable based on performance)"],
        ["Stipend:", "₹15,000/month"],
        ["Location:", "Hybrid (Remote + On-site training)"],
        ["Start Date:", "To be confirmed upon acceptance"],
    ]
    
    table = Table(data, colWidths=[2*inch, 4*inch])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))
    
    # Responsibilities
    elements.append(Paragraph("<b>Key Responsibilities:</b>", heading_style))
    responsibilities = [
        "• Provide expert consultation on crop management and agricultural practices",
        "• Assist in developing technology solutions for farming challenges",
        "• Conduct research on modern agricultural techniques and trends",
        "• Support farmers with data-driven insights for improved yield",
        "• Collaborate with the tech team to translate agricultural expertise into scalable solutions"
    ]
    for resp in responsibilities:
        elements.append(Paragraph(resp, body_style))
    elements.append(Spacer(1, 15))
    
    # Terms and Conditions
    elements.append(Paragraph("<b>Terms and Conditions:</b>", heading_style))
    terms = [
        "1. This internship offer is contingent upon successful completion of any pending documentation.",
        "2. The intern agrees to maintain confidentiality regarding company information and proprietary data.",
        "3. Performance will be evaluated periodically, and continuation of the internship depends on satisfactory performance.",
        "4. The intern must comply with all company policies and agricultural safety guidelines.",
        "5. This offer letter must be signed and returned within 7 days of receipt."
    ]
    for term in terms:
        elements.append(Paragraph(term, body_style))
    elements.append(Spacer(1, 20))
    
    # Contact Information
    elements.append(Paragraph("<b>Your Information:</b>", heading_style))
    contact_info = f"""
    <b>Name:</b> {candidate_name}<br/>
    <b>Email:</b> {email}<br/>
    <b>Phone:</b> {phone}
    """
    elements.append(Paragraph(contact_info, body_style))
    elements.append(Spacer(1, 25))
    
    # Closing
    closing_text = """
    We are excited about the prospect of you joining our team and believe you will be a valuable addition 
    to Annam AgriTech. If you have any questions or need further clarification, please do not hesitate to contact us.
    """
    elements.append(Paragraph(closing_text, body_style))
    elements.append(Spacer(1, 30))
    
    # Acceptance Section
    elements.append(Paragraph("<b>Acceptance of Offer:</b>", heading_style))
    acceptance_text = """
    I, _________________________ (Candidate Name), accept the offer of Agri Expert Internship 
    at Annam AgriTech on the terms and conditions mentioned above.
    """
    elements.append(Paragraph(acceptance_text, body_style))
    elements.append(Spacer(1, 20))
    
    # Signature lines
    elements.append(Paragraph("_________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_________________________", body_style))
    elements.append(Paragraph("Candidate Signature&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date", body_style))
    elements.append(Spacer(1, 40))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=body_style,
        fontSize=9,
        textColor=colors.gray,
        alignment=1
    )
    elements.append(Paragraph("Annam AgriTech | Agricultural Innovation Hub | www.annmagritech.com", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


@router.get("/offer-letter")
async def get_offer_letter(
    name: str = Query(..., description="Candidate full name"),
    email: str = Query(..., description="Candidate email"),
    phone: str = Query(..., description="Candidate phone number"),
    action: str = Query("view", description="Action: 'view' or 'download'")
):
    """
    Generate and serve an offer letter PDF for Agri Expert Internship.
    
    - **name**: Candidate's full name
    - **email**: Candidate's email address
    - **phone**: Candidate's phone number
    - **action**: 'view' to open in browser, 'download' to download file
    """
    try:
        pdf_buffer = generate_offer_letter_pdf(
            candidate_name=name,
            email=email,
            phone=phone
        )
        
        # Determine content disposition based on action
        if action == "download":
            headers = {
                "Content-Disposition": f"attachment; filename=Offer_Letter_{name.replace(' ', '_')}.pdf"
            }
        else:
            headers = {
                "Content-Disposition": "inline; filename=Offer_Letter.pdf"
            }
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers=headers
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate offer letter: {str(e)}")