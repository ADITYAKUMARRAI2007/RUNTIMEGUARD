FROM mcr.microsoft.com/playwright/python:v1.45.0-jammy

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright browsers already in base image — just install chromium
RUN playwright install chromium

# Copy app
COPY . .

# Create output directories
RUN mkdir -p outputs/screenshots outputs/scans outputs/patches outputs/sandboxes

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
