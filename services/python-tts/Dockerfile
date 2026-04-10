FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_DATA_HOME=/usr/local/share \
    NLTK_DATA=/usr/local/share/nltk_data

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget git && rm -rf /var/lib/apt/lists/*

COPY services/python-tts/requirements.txt ./requirements.txt
COPY services/python-tts/requirements.providers.txt ./requirements.providers.txt

RUN pip install --no-cache-dir -r requirements.txt -r requirements.providers.txt
RUN mkdir -p /usr/local/share/nltk_data /usr/local/share/unidic
COPY services/python-tts/bootstrap_assets.py ./bootstrap_assets.py
RUN python ./bootstrap_assets.py

COPY services/python-tts/app ./app

# Run as non-root user for container security.
RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 8010

# TTS_WORKERS controls uvicorn worker count (default 1).
# Set TTS_WORKERS=2 (or higher) in your env to enable concurrent synthesis.
# Each worker loads the model independently; ensure sufficient RAM per worker.
ENV TTS_WORKERS=1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers ${TTS_WORKERS}"]
