import argparse
from pathlib import Path
from typing import BinaryIO

import torch
from PIL import Image
from torch import nn


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_PATH = DATA_DIR / "receipt_amount_model.pth"
SCALE = 10_000


class ReceiptAmountCNN(nn.Module):
    def __init__(self):
        super().__init__()

        self.features = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((4, 4)),
        )

        self.regressor = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 4 * 4, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(self, image):
        features = self.features(image)
        return self.regressor(features)


def load_image(image_source: Path | BinaryIO) -> torch.Tensor:
    with Image.open(image_source) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("画像の解像度が上限を超えています。")

        image = image.convert("RGB").resize((128, 128))
        pixels = list(image.getdata())

    image_tensor = (
        torch.tensor(pixels, dtype=torch.float32)
        .reshape(128, 128, 3)
        .permute(2, 0, 1)
        / 255
    )

    return image_tensor.unsqueeze(0)


def load_model() -> ReceiptAmountCNN:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"学習済みモデルが見つかりません: {MODEL_PATH}")

    model = ReceiptAmountCNN()
    model_state = torch.load(
        MODEL_PATH,
        map_location="cpu",
        weights_only=True,
    )
    model.load_state_dict(model_state)
    model.eval()
    return model


def predict_tensor(model: ReceiptAmountCNN, image_tensor: torch.Tensor) -> int:
    with torch.no_grad():
        scaled_amount = model(image_tensor).item()

    return round(scaled_amount * SCALE)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="レシート画像から合計金額を予測します"
    )
    parser.add_argument("image", help="予測するレシート画像のパス")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.is_absolute():
        image_path = BASE_DIR / image_path

    if not image_path.is_file():
        parser.error(f"画像ファイルが見つかりません: {image_path}")

    if not MODEL_PATH.is_file():
        parser.error(f"学習済みモデルが見つかりません: {MODEL_PATH}")

    model = load_model()
    image_tensor = load_image(image_path)
    predicted_yen = predict_tensor(model, image_tensor)
    print(f"予測金額: {predicted_yen:,}円")


if __name__ == "__main__":
    main()