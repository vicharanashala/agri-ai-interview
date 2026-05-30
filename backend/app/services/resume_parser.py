"""
Resume text extraction utility — supports PDF and DOCX.
Used by the resume upload endpoint to extract raw text for storage.
"""

import io
from typing import Optional

import pdfplumber
from docx import Document


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF using pdfplumber."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract all text from a DOCX using python-docx."""
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def extract_raw_text(content: bytes, file_type: str) -> str:
    """
    Dispatch to the right extractor based on file MIME type.
    file_type: "pdf" or "docx"
    Returns extracted text, or empty string on failure.
    """
    file_type = file_type.lower()
    if file_type == "pdf":
        try:
            return extract_text_from_pdf(content)
        except Exception as e:
            print(f"[resume_parser] PDF extraction error: {e}")
            return ""
    elif file_type == "docx":
        try:
            return extract_text_from_docx(content)
        except Exception as e:
            print(f"[resume_parser] DOCX extraction error: {e}")
            return ""
    return ""