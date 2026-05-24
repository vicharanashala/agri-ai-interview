from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime

router = APIRouter()

styles = getSampleStyleSheet()


def create_joining_pdf(data: dict) -> bytes:
    """Generate a professional PDF for joining details."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    elements = []
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a365d')
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor('#2d3748')
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6
    )
    
    # Header
    elements.append(Paragraph("JOINING DETAILS", title_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#3182ce')))
    elements.append(Spacer(1, 20))
    
    # Candidate Information Section
    elements.append(Paragraph("Candidate Information", section_style))
    candidate_data = [
        ["Name:", data['user']['name']],
        ["Email:", data['user']['email']],
        ["Phone:", data['user']['phone']],
    ]
    
    candidate_table = Table(candidate_data, colWidths=[3*cm, 12*cm])
    candidate_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
    ]))
    elements.append(candidate_table)
    
    # Joining Schedule Section
    elements.append(Spacer(1, 15))
    elements.append(Paragraph("Joining Schedule", section_style))
    joining_data = [
        ["Location:", data['joining']['location']],
        ["Start Date:", data['joining']['startDate']],
        ["Reporting Time:", data['joining']['reportingTime']],
    ]
    
    joining_table = Table(joining_data, colWidths=[3*cm, 12*cm])
    joining_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(joining_table)
    
    # Documents Checklist Section
    elements.append(Spacer(1, 15))
    elements.append(Paragraph("Documents to Carry", section_style))
    elements.append(Paragraph(
        "Please bring the originals and one set of photocopies of all documents.",
        ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, textColor=colors.grey)
    ))
    elements.append(Spacer(1, 10))
    
    # Document items
    doc_header = [["#", "Document", "Description"]]
    doc_rows = []
    for i, document in enumerate(data['documents'], 1):
        doc_rows.append([
            str(i),
            document['name'],
            document['description']
        ])
    
    doc_table_data = doc_header + doc_rows
    doc_table = Table(doc_table_data, colWidths=[1*cm, 5*cm, 9*cm])
    doc_table.setStyle(TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3182ce')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        
        # Data rows
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 10),
        
        # Alignment
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),
        ('ALIGN', (2, 1), (2, -1), 'LEFT'),
        
        # Alternating row colors
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
        
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        
        # Vertical alignment
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(doc_table)
    
    # Footer note
    elements.append(Spacer(1, 30))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 10))
    
    note_style = ParagraphStyle(
        'Note',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#718096')
    )
    elements.append(Paragraph(
        "<b>Important Note:</b> Please ensure all documents are ready before your joining date. "
        "If you have any questions, please contact HR.",
        note_style
    ))
    elements.append(Spacer(1, 20))
    
    # Generated timestamp
    generated_text = f"Generated on: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"
    elements.append(Paragraph(generated_text, note_style))
    
    # Build PDF
    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes


@router.post("/pdf")
async def generate_joining_pdf(data: dict):
    """Generate and return a PDF containing joining details."""
    pdf_bytes = create_joining_pdf(data)
    
    filename = f"joining-details-{data['user']['name'].replace(' ', '-').lower()}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )