FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    pkg-config \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/tessdata_best && \
    curl -L "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata" -o /opt/tessdata_best/eng.traineddata && \
    curl -L "https://github.com/tesseract-ocr/tessdata_best/raw/main/hin.traineddata" -o /opt/tessdata_best/hin.traineddata

# Pre-download SentenceTransformer model to cache it in the image layer
RUN pip install torch==2.13.0+cpu sentence-transformers==6.0.0 --extra-index-url https://download.pytorch.org/whl/cpu && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-base', device='cpu')"


# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code and the safe AI brain
COPY app/ ./app/
COPY references.npz .

# Create empty .env if not exists
RUN touch .env

EXPOSE 8000

# Run migrations + start server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]