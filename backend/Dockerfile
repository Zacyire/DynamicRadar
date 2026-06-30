# Optional container build (alternative to Render's native Python runtime).
# Py-ART installs from manylinux wheels, but we include its native libraries so
# a source build (unusual platforms/versions) also succeeds.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CACHE_DIR=/tmp/nexrad-cache

RUN apt-get update && apt-get install -y --no-install-recommends \
        libhdf5-103 libnetcdf19 libgeos-c1v5 libproj22 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .

# Render/most PaaS inject $PORT; default to 8000 locally.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
