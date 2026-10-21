FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /app
COPY server.py /app/server.py
RUN mkdir -p /data && chown -R nobody:nogroup /app /data
USER nobody
VOLUME ["/data"]
EXPOSE 8000
CMD ["python", "/app/server.py"]
