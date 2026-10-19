# バックエンド

Hono を使った家計簿アプリの API サーバーです。

## 開発環境での起動

環境変数を設定してから、依存パッケージをインストールし、開発サーバーを起動します。

```sh
npm install
npm run dev
```

API サーバーは `http://localhost:3000` で起動します。

## 環境変数

バックエンドの環境に、次の環境変数を設定してください。

| 変数名 | 説明 |
| --- | --- |
| `FRONTEND_URL` | フロントエンドのオリジン。スキームとホスト名を含め、パスは含めません |
| `DATABASE_HOST` | データベースのホスト名 |
| `DATABASE_PORT` | データベースのポート番号 |
| `DATABASE_NAME` | データベース名 |
| `DATABASE_USER` | データベースのユーザー名 |
| `DATABASE_PASSWORD` | データベースのパスワード |

デプロイ済みのフロントエンドを使う場合は、バックエンドの Vercel プロジェクトの環境変数に、`FRONTEND_URL` として次の値を設定してからバックエンドを再デプロイしてください。

```text
https://kakeibo-app-frontend-seven.vercel.app
```

データベースへの接続は、データベースを使う API リクエストが発生したときに行われます。そのため、CORS のプリフライトリクエストはデータベース接続の有無にかかわらず処理できます。

## ビルドと起動

```sh
npm run build
npm start
```
