# Dockerfile for GroundedOS Lab Worker (Python async task processor)
# Runs ML jobs, ETL tasks, and compute-heavy operations

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker source
COPY . ./worker

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash worker && \
    chown -R worker:worker /app

USER worker

# Placeholder process loop until async jobs are implemented
CMD ["python", "worker/main.py"]
