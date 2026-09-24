import os
os.environ.setdefault("OMP_THREAD_LIMIT", "1")

import io
import fitz
import pytesseract
from PIL import Image
from tesserocr import RIL, PT, PyTessBaseAPI

TESSDATA_PATH = "/opt/tessdata_best"          # directory holding *.traineddata in docker
# Fallback to local if not in docker
if not os.path.exists(TESSDATA_PATH):
    TESSDATA_PATH = os.path.join(os.path.dirname(__file__), "tessdata_best")

DPI = 300

IMAGE_BLOCK_TYPES  = {PT.FLOWING_IMAGE, PT.HEADING_IMAGE, PT.PULLOUT_IMAGE}
TABLE_BLOCK_TYPES  = {PT.TABLE}
IGNORE_BLOCK_TYPES = {PT.HORZ_LINE, PT.VERT_LINE, PT.NOISE}
MIN_BLOCK_DIM_PX   = 10

def load_as_image(data: bytes, filename: str, pdf_password: str | None = None) -> Image.Image:
    if filename.lower().endswith(".pdf"):
        doc = fitz.open(stream=data, filetype="pdf")
        try:
            if doc.needs_pass:
                if not (pdf_password and doc.authenticate(pdf_password)):
                    raise ValueError("PDF is encrypted; a password is required")
            if len(doc) == 0:
                raise ValueError("PDF has 0 pages (malformed/corrupt file)")
            pix = doc[0].get_pixmap(dpi=DPI)
            return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        finally:
            doc.close()
    return Image.open(io.BytesIO(data)).convert("RGB")

def ocr_transcript(img: Image.Image, ocr_lang: str = "eng") -> str:
    tesseract_lang = f"{ocr_lang}+eng" if ocr_lang != "eng" else "eng"
    
    if not os.path.exists(TESSDATA_PATH):
        # Graceful degradation if tessdata is missing (e.g. running outside docker without setup)
        return ""

    blocks = []
    with PyTessBaseAPI(path=TESSDATA_PATH, lang=tesseract_lang) as api:
        api.SetImage(img)
        api.Recognize()
        it = api.AnalyseLayout()
        while it and not it.Empty(RIL.BLOCK):
            bbox, btype = it.BoundingBox(RIL.BLOCK), it.BlockType()
            if bbox and btype not in IGNORE_BLOCK_TYPES:
                x1, y1, x2, y2 = bbox
                if (x2 - x1) >= MIN_BLOCK_DIM_PX and (y2 - y1) >= MIN_BLOCK_DIM_PX:
                    blocks.append(bbox)
            if not it.Next(RIL.BLOCK):
                break

    parts = []
    for bbox in blocks:
        text = pytesseract.image_to_string(
            img.crop(bbox),
            lang=tesseract_lang,
            config=f'--tessdata-dir "{TESSDATA_PATH}"',
        ).strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)
