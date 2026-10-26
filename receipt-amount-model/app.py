from contextlib import asynccontextmanager
from io import BytesIO
from typing import AsyncIterator

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from predict import load_image, load_model, predict_tensor


MAX_IMAGE_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.model = load_model()
    yield


app = FastAPI(
    title="レシート金額予測API",
    description="レシート画像から合計金額を予測します。",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict")
def predict_receipt(
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, int]:
    image_bytes = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="画像は10MB以下にしてください。")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="画像ファイルが空です。")

    try:
        image_tensor = load_image(BytesIO(image_bytes))
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as error:
        raise HTTPException(
            status_code=400,
            detail="有効な画像ファイルを指定してください。",
        ) from error

    predicted_yen = predict_tensor(request.app.state.model, image_tensor)
    return {"predicted_yen": predicted_yen}
