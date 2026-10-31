# シンプル家計簿

収入・支出を記録する家計簿アプリです。ユーザー認証と取引管理を行うWebアプリに、任意のレシート金額予測機能を組み合わせています。

## 公開中のアプリ

- **アプリURL:** [https://kakeibo-app-frontend-seven.vercel.app](https://kakeibo-app-frontend-seven.vercel.app)
- ログインせずにゲストとして取引の登録・確認・削除を試せます。ゲストデータは同じブラウザーで利用し、最終利用から30日で期限切れになります。
- アカウントを作成するとゲストデータは自動で引き継がれます。既存アカウントへのログイン時は、引き継ぐかどうかを選べます。
- レシート画像からの金額予測は、バックエンドとレシート予測APIが利用可能な場合に使えます。

アプリのフロントエンドはVercelで公開されています。認証や取引データの読み書きには、別途デプロイされたバックエンドとPostgreSQLデータベースが必要です。レシート予測を使う場合は、バックエンドから到達できるレシート予測APIも必要です。

## Vercelへのデプロイ設定

フロントエンドとバックエンドは、それぞれのディレクトリをルートにしたVercelプロジェクトとして設定します。デプロイ先のURLは各Vercelプロジェクトの **Settings → Domains** で確認してください。

### フロントエンドプロジェクト

- **Root Directory:** `web-app`
- **環境変数:** `VITE_API_BASE_URL` にバックエンドの公開URLを設定します（例: `https://<backend-domain>`）。末尾に `/transactions` などのAPIパスは付けません。
- `VITE_API_BASE_URL` はビルド時にフロントエンドへ反映されます。値を変更した場合は再デプロイしてください。

### バックエンドプロジェクト

- **Root Directory:** `backend`
- 以下の環境変数をVercelプロジェクトに設定します。値は各サービスの接続情報に置き換えてください。

| 変数名 | 設定値 |
| --- | --- |
| `FRONTEND_URL` | フロントエンドの公開オリジン。現在は `https://kakeibo-app-frontend-seven.vercel.app` |
| `MODEL_API_URL` | レシート予測APIの公開URL。ローカル開発用の `localhost` は使用できません |
| `DATABASE_HOST` | PostgreSQLのホスト名 |
| `DATABASE_PORT` | PostgreSQLのポート番号 |
| `DATABASE_NAME` | データベース名 |
| `DATABASE_USER` | データベースのユーザー名 |
| `DATABASE_PASSWORD` | データベースのパスワード |

`FRONTEND_URL` はCORSで許可するオリジンです。フロントエンドのドメインを変更した場合は、この値も更新してバックエンドを再デプロイしてください。環境変数や接続情報などの秘密情報をソースコードや公開リポジトリに登録しないでください。

### レシート予測API

レシート予測機能を公開環境で使うには、FastAPIサービスをバックエンドからアクセス可能な環境にデプロイし、その公開URLをバックエンドの `MODEL_API_URL` に設定します。モデルファイル `data/receipt_amount_model.pth` も実行環境に必要です。設定後、バックエンドとフロントエンドを再デプロイしてください。

### 公開版で404が発生した場合

ブラウザーの開発者ツールで **Network** を開き、404になったリクエストのURLを確認してください。

- URLのホストがフロントエンドのドメインになっている場合は、フロントエンドの `VITE_API_BASE_URL` がバックエンドの公開URLか確認し、フロントエンドを再デプロイします。
- バックエンドの `/receipts/predict` が404の場合は、`MODEL_API_URL` ではなく、フロントエンドの `VITE_API_BASE_URL` がバックエンドのURLを指しているか確認します。
- モデルAPIの `/predict` が404の場合は、`MODEL_API_URL` がモデルAPIのベースURL（`/predict` を含まない）か確認します。

URLの構成が正しいのに404が続く場合は、各サービスのデプロイ状態とログ、およびリクエストパスを確認してください。

## 構成

| ディレクトリ | 役割 | 主な技術 |
| --- | --- | --- |
| `web-app/` | ブラウザーで操作するフロントエンド | React、TypeScript、Vite、Chakra UI |
| `backend/` | 認証・取引管理・予測API連携 | Hono、Node.js、PostgreSQL |
| `receipt-amount-model/` | レシート画像から金額を予測するAPI | FastAPI、PyTorch |

レシート予測を使わない場合、モデルAPIの起動は不要です。

## 必要な環境

- Node.js と npm
- PostgreSQLデータベース
- Python 3 と pip（レシート予測を使う場合）

## ローカル起動

各サービスを別々のターミナルで起動します。

### 1. レシート金額予測API（任意）

リポジトリのルートで実行します。

```sh
cd receipt-amount-model
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

起動時に `data/receipt_amount_model.pth` が読み込まれます。正常に起動したら、`http://localhost:8000/health` で稼働状態を確認できます。

### 2. バックエンド

`backend/.env` を作成し、次の環境変数を設定します。

```dotenv
FRONTEND_URL=http://localhost:5173
MODEL_API_URL=http://localhost:8000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=your_database
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
```

PostgreSQLにはアプリが使用する `users`、`user_sessions`、`transactions` テーブルが必要です。これらの基本テーブルを新規作成する手順はこのリポジトリには含まれていません。既存データベースでゲスト利用を有効にする移行は [`backend/migrations/001_guest_sessions.sql`](./backend/migrations/001_guest_sessions.sql) を参照してください。

環境変数を設定したら、`backend/` で実行します。

```sh
npm install
npm run dev
```

APIは `http://localhost:3000` で起動します。レシート予測APIを使わない場合も `MODEL_API_URL` は設定してください。

### 3. フロントエンド

`web-app/.env` を作成し、バックエンドのURLを設定します。

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

`web-app/` で実行します。

```sh
npm install
npm run dev
```

ターミナルに表示されたURL（通常は `http://localhost:5173`）をブラウザーで開きます。バックエンドの `FRONTEND_URL` には、実際にフロントエンドを開いているオリジンを設定してください。

## 開発用コマンド

`web-app/` で実行できます。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | フロントエンド開発サーバーを起動 |
| `npm run build` | 型チェック後、本番用ファイルを `dist/` に出力 |
| `npm run lint` | ESLintを実行 |
| `npm run preview` | ビルドしたフロントエンドをプレビュー |

`backend/` で実行できます。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | バックエンド開発サーバーを起動 |
| `npm run build` | TypeScriptをビルド |
| `npm start` | ビルド済みバックエンドを起動 |

## API仕様

バックエンドのAPI定義は [`backend/openapi.yaml`](./backend/openapi.yaml) を参照してください。

## 関連ドキュメント

- [フロントエンド](./web-app/README.md)
- [バックエンド](./backend/README.md)
- [レシート金額予測API](./receipt-amount-model/README.md)
