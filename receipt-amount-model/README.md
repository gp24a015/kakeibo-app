# レシート金額予測API

## 起動

`receipt-amount-model` ディレクトリで依存関係をインストールし、APIを起動します。
PyTorchはCPU専用版を使用します。

```bash
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

起動時に `data/receipt_amount_model.pth` を読み込みます。モデルファイルがない場合、APIは起動に失敗します。

## エンドポイント

- `GET /health` — 稼働確認
- `POST /predict` — `file` という名前の画像ファイルをmultipart/form-dataで受け取り、予測金額を返します

成功時のレスポンス例:

```json
{
  "predicted_yen": 1280
}
```

画像ファイルは10MB以下、解像度は2,000万画素以下に制限しています。API仕様は起動後の `/docs` でも確認できます。
