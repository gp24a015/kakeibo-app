import csv
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset, random_split


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "receipt_totals.csv"
SCALE = 10_000


class ReceiptDataset(Dataset):
    def __init__(self, records):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, index):
        image_path, total_yen = self.records[index]

        with Image.open(image_path) as image:
            image = image.convert("RGB").resize((128, 128))
            pixels = list(image.getdata())

        image_tensor = (
            torch.tensor(pixels, dtype=torch.float32)
            .reshape(128, 128, 3)
            .permute(2, 0, 1)
            / 255
        )
        amount_tensor = torch.tensor(
            [total_yen / SCALE],
            dtype=torch.float32,
        )

        return image_tensor, amount_tensor


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


records = []

with CSV_PATH.open(encoding="utf-8-sig", newline="") as csv_file:
    for row in csv.DictReader(csv_file):
        image_path = DATA_DIR / row["image_path"]
        total_yen = int(row["total_yen"])

        if not image_path.is_file():
            raise FileNotFoundError(f"画像が見つかりません: {image_path}")

        records.append((image_path, total_yen))

if len(records) < 2:
    raise ValueError("学習には画像と金額の組が2件以上必要です。")

dataset = ReceiptDataset(records)

validation_count = max(1, int(len(dataset) * 0.2))
training_count = len(dataset) - validation_count

generator = torch.Generator().manual_seed(42)
training_data, validation_data = random_split(
    dataset,
    [training_count, validation_count],
    generator=generator,
)

training_loader = DataLoader(training_data, batch_size=4, shuffle=True)
validation_loader = DataLoader(validation_data, batch_size=4)

model = ReceiptAmountCNN()
loss_function = nn.MSELoss()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

for epoch in range(100):
    model.train()

    for images, amounts in training_loader:
        predictions = model(images)
        loss = loss_function(predictions, amounts)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    model.eval()
    absolute_error_sum = 0.0
    validation_item_count = 0

    with torch.no_grad():
        for images, amounts in validation_loader:
            predictions = model(images) * SCALE
            actual_amounts = amounts * SCALE

            absolute_error_sum += (
                (predictions - actual_amounts).abs().sum().item()
            )
            validation_item_count += len(images)

    mean_absolute_error = absolute_error_sum / validation_item_count
    print(
        f"Epoch {epoch + 1:03d}/100 "
        f"検証データの平均誤差: {mean_absolute_error:.0f}円"
    )

model_path = DATA_DIR / "receipt_amount_model.pth"
torch.save(model.state_dict(), model_path)
print(f"学習済みモデルを保存しました: {model_path}")