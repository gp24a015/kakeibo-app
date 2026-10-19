# フロントエンド

React、TypeScript、Vite を使った家計簿アプリのフロントエンドです。

## 開発環境での起動

```sh
npm install
npm run dev
```

表示された URL をブラウザーで開くと、開発中のアプリを確認できます。開発サーバーは通常、コードを変更すると画面を自動更新します（HMR）。

## 利用できるコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動する |
| `npm run build` | TypeScript のチェックを行い、本番用ファイルを `dist` に出力する |
| `npm run lint` | ESLint でコードをチェックする |
| `npm run preview` | ビルドしたファイルをローカルでプレビューする |

## React の高速更新

Vite の React プラグインによって、開発中にページ全体を再読み込みせずに変更を反映できます。公式プラグインには次の選択肢があります。

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react)：Babel を使います
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc)：SWC を使います

このプロジェクトでは `@vitejs/plugin-react` を使用しています。

## ESLint の設定について

現在の設定は基本的なチェックを行います。プロダクション向けに開発を進める場合は、TypeScript の型情報を利用した ESLint ルールを追加すると、より詳しいチェックができます。設定例は [typescript-eslint のドキュメント](https://typescript-eslint.io/getting-started/typed-linting/)を参照してください。

React 固有のルールが必要な場合は、[eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) と [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) も利用できます。
