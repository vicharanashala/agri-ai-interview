FROM python:3.11-slim

WORKDIR /app

# Install system deps, Tailscale, and poppler-utils for PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc curl ca-certificates poppler-utils \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code and entrypoint
COPY app/ ./app/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Create empty .env if not exists
RUN touch .env

EXPOSE 8080

# Run Tailscale and then start the server
CMD ["./entrypoint.sh"]