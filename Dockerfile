# ── Recall Dockerfile ──────────────────────────────────────
# Flat project structure: all files at repo root
# Usage:
#   docker build -t recall .
#   docker run -p 8000:8000 -v recall_data:/app/.recall_data recall

FROM python:3.11-slim

# System deps for EasyOCR + Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (Docker layer cache)
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY main.py ./main.py

# Copy frontend into /app/frontend/ (where main.py serves from)
COPY index.html ./frontend/index.html
COPY style.css  ./frontend/style.css
COPY script.js  ./frontend/script.js

# Persistent data volume
VOLUME ["/app/.recall_data"]

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]