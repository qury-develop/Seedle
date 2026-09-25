# Seedle

小さな「ほしい」を投稿し、欲しい人・作りたい人・見守りたい人を集めるMVPです。

## 今入っているもの

- 投稿一覧、検索、カテゴリ絞り込み、人気順 / 新着順
- 投稿詳細、ほしい / 作りたい / ウォッチ、コメント
- 投稿作成
- ログイン / 新規登録の入口
- 初回ニックネーム登録と後からの変更
- マイページの自分の投稿 / ウォッチ中 / 作りたい
- 将来の永続化に向けたDrizzle schema

## 技術スタック

- Vinext / React / TypeScript
- Tailwind CSS
- lucide-react
- Drizzle schema for D1 or SQLite-compatible persistence
- pnpm

## 開発

```bash
pnpm install
pnpm run dev
```

ブラウザで `http://localhost:3000/` を開きます。

## 確認

```bash
pnpm run build
pnpm run lint
pnpm test
```

## 次に接続するもの

本番化では、Googleログインを実IDとして接続し、`profiles`, `posts`,
`reactions`, `comments` を永続化します。今の画面は、その接続前でも体験を確認できる
MVPとして動きます。