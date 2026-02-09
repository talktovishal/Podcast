FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget && rm -rf /var/lib/apt/lists/*

COPY services/python-tts/requirements.txt ./requirements.txt
COPY services/python-tts/requirements.providers.txt ./requirements.providers.txt

RUN pip install --no-cache-dir -r requirements.txt -r requirements.providers.txt

COPY services/python-tts/app ./app

EXPOSE 8010

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
