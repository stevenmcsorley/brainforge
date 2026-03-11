FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

COPY python/engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY python/ ./python/
COPY apps/sim-worker/ ./apps/sim-worker/

ENV PYTHONPATH=/app/python:/app/apps/sim-worker
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "sim_worker.main"]
