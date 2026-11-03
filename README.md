# Seedle

小さな「ほしい」を、事業の種に。

Vinext / React / TypeScript、Cloudflare Workers / D1、Better Auth（Google OAuth）で動作します。
公開デモ用の架空データ、疑似ログイン、本番の認証を回避する開発用エンドポイントはありません。

## 実装済み

- 公開投稿の一覧・検索・カテゴリ・人気順 / 新着順・ページ切り替え
- Google認証、DBに保存するセッション、ログアウト
- 初回ニックネーム登録・変更（重複可。所有権はユーザーIDで判定）
- 投稿作成・編集・削除、匿名表示、ステータス・公開URL
- ほしい / 作りたい / ウォッチ（同一ユーザーの重複登録をDBで防止）
- コメントの投稿・本人による削除
- 自分の投稿・ウォッチ中・作りたい一覧
- サーバーでの認証・権限・入力検証、Origin検証、投稿頻度制限
- 匿名投稿のレスポンスから所有者ID・ニックネーム・メールアドレスを除外
- 古い編集内容で上書きしないバージョンチェック

閲覧はログイン不要です。投稿・コメント・リアクションにはGoogleログインとニックネーム登録が必要です。
投稿の匿名設定は表示名だけを隠し、本人による管理は継続できます。コメントにはニックネームを表示します。

## ローカル開発

Node.js 22.13以上、pnpmを使用します。

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

既定のURLは `http://localhost:3000` です。`.dev.vars.example` と同じ項目を `.dev.vars` に設定します。
別ポートを使う場合は `.dev.vars` の `APP_URL` も合わせ、Google側のコールバックURLにも登録してください。
認証情報が未設定でも閲覧用の画面とDBは動きますが、Googleログインは無効になります。疑似ログインへの切り替えはありません。

必要な値:

| 項目 | 用途 |
| --- | --- |
| `APP_URL` | サイトのorigin。末尾スラッシュなし |
| `BETTER_AUTH_SECRET` | 32文字以上のランダム値。セッションCookie署名とOAuthトークン暗号化用 |
| `GOOGLE_CLIENT_ID` | Google OAuthのWebアプリ用クライアントID |
| `GOOGLE_CLIENT_SECRET` | 同クライアントのシークレット |

秘密値は `.dev.vars` またはCloudflareのSecretsで管理します。Gitにコミットしないでください。

## Cloudflare Workersへの公開

CloudflareとGoogleの実アカウントへの登録は別途必要です。現在の `wrangler.jsonc` はローカル用のURLと仮のDB IDを持ち、`pnpm deploy` はそのままでは停止します。

1. Cloudflareへログインし、D1を作成します。

   ```sh
   pnpm exec wrangler login
   pnpm exec wrangler d1 create seedle
   ```

2. `wrangler.jsonc` の `d1_databases[0].database_id` を発行されたIDに変更します。CloudflareのWorkersサブドメインを確認し、`vars.APP_URL` に公開するHTTPS originを設定します。独自ドメインでも構いません。URLを変更したらGoogle設定も更新してください。

3. Google Cloud ConsoleでOAuthクライアント（ウェブアプリケーション）を作成します。
   - 認証対象はGoogleの基本プロフィールとメールアドレスです。
   - 承認済みリダイレクトURI: `<APP_URL>/api/auth/callback/google`
   - ローカル用: `http://localhost:3000/api/auth/callback/google`
   - 一般ユーザーが利用する場合はOAuth同意画面の公開対象・公開ステータスを設定します。テストユーザー限定のままにしないでください。

4. Cloudflareに認証情報を登録します。`BETTER_AUTH_SECRET` はパスワードマネージャー等で生成した十分に長いランダム値を使用します。

   ```sh
   pnpm exec wrangler secret put BETTER_AUTH_SECRET
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   ```

5. 本番DBに移行を適用し、検証後にデプロイします。

   ```sh
   pnpm deploy:check
   pnpm db:migrate:remote
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm test:worker
   pnpm deploy
   ```

6. 公開先の `/api/health` がHTTP 200と `{"status":"ok"}` を返すことを確認します。その後、Googleログイン、ニックネーム登録、投稿、再読み込み、別ユーザーでの閲覧を実際のドメイン上で確認します。ヘルスチェックはGoogleとの実認証の成功までは保証しません。

初回のSecrets登録時にWorker作成を求められた場合は、同じ `seedle` 名で作成します。
既存Workerへ再デプロイする場合、秘密値は保持されます。セッションとトークンを維持するため `BETTER_AUTH_SECRET` を不用意に変更しないでください。

## GitHubからの自動デプロイ

Cloudflare Workers Buildsでこのリポジトリを連携できます。上の初期設定後に設定してください。

- Build command: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build && pnpm test:worker`
- Deploy command: `pnpm deploy:check && pnpm exec wrangler d1 migrations apply DB --remote && pnpm exec wrangler deploy`
- ビルド環境のNode.jsは22.13以上を指定します。
- Googleなどの秘密値はWorkerのランタイムSecretsに設定し、フロントエンドのビルド変数にはしません。
- 将来データを削除する移行を追加するときは、自動適用の前にD1の復旧手段と影響を確認します。現在の初回移行は空のDBにテーブルを作成するだけです。

## 検証

`pnpm test` はローカルの独立したD1に移行を適用し、認証・権限・匿名表示・永続化・並行リアクション・入力検証・CSRF・レート制限・OAuth開始と不正コールバックを確認します。実Googleアカウントや本番DBには接続しません。

`pnpm build && pnpm test:worker` は配布用Workerをworkerdで起動し、HTMLとAPIを確認します。
`pnpm test:browser` はビルド済みWorkerと独立したD1を使ってブラウザ操作を確認します。初回は `pnpm exec playwright install chromium` を実行してください。必要に応じて `SEEDLE_BROWSER_EXECUTABLE` でChrome / Edgeの実行ファイルを指定できます。

認証テストはテスト用DBにのみ署名済みセッションを作成します。実Googleの認証コード交換は公開ドメインとGoogleの認証情報を設定してから確認する必要があります。

## 運用

- DBの変更は `db/schema.ts` → `pnpm db:generate` → 移行SQLの確認 → 適用の順で管理します。
- 日次Cronが期限切れセッション・OAuth一時データ・レート制限レコードを削除します。
- 投稿・コメントの削除時、関連するコメント・リアクションも外部キーで削除されます。
- 投稿は1ユーザーにつき1時間10件、コメントは1分10件、全書き込みは1分60回を上限にしています。
- APIは個人別の結果が混ざらないよう `private, no-store` を返します。
- Googleのプロフィール名・メールアドレスは認証用DBにのみ保持し、公開投稿APIには返しません。
- 本番公開時には運営者情報、利用規約・プライバシーポリシー、問い合わせ先を実際の運営方針に合わせて用意してください。

参考: [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)、[Better Auth Google設定](https://better-auth.com/docs/authentication/google)。
