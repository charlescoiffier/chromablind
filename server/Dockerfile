FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends liblcms2-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server /app/server
RUN useradd --uid 10001 --create-home app
USER app
EXPOSE 8000
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "8", "--timeout-keep-alive", "5"]
