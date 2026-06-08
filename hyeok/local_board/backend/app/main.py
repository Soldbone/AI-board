from fastapi import FastAPI

app = FastAPI(title="Local Board API")


@app.get("/health")
def health_check():
    return {"status": "ok"}