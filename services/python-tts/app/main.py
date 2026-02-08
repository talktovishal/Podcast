from fastapi import FastAPI

app = FastAPI(title="ListenLater Python TTS Scaffold")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
