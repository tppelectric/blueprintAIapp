FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY services/scanner/requirements.txt services/scanner/requirements.txt
RUN pip install --no-cache-dir -r services/scanner/requirements.txt

COPY services services

ENV PYTHONUNBUFFERED=1
EXPOSE 8001

CMD ["python", "-m", "uvicorn", "services.scanner.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
