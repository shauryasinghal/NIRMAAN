FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 HF_HOME=/opt/hf NIRMAAN_ENV=production
WORKDIR /app

# psycopg2-binary and the CPU torch wheel need no compiler; curl is only for the container healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch keeps the image ~1 GB smaller than the default CUDA build.
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt

# Bake the MiniLM weights into the image so the first originality check never downloads anything at request time.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY app ./app
COPY fixtures ./fixtures
RUN useradd --create-home --uid 10001 nirmaan && chown -R nirmaan /app /opt/hf
USER nirmaan

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fsS http://localhost:${PORT:-8000}/health || exit 1
# PORT is injected by most hosts (Render, Railway, Fly); falls back to 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
