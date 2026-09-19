# Supabase の準備（共有ジムを本物にする）

所要 10〜15 分。パスワードや秘密の鍵は、チャットにもファイルにも貼らないでください。

## 1. プロジェクトを作る

1. https://supabase.com で「Start your project」→ GitHub かメールでサインアップ
2. 「New project」
   - Name: `kinniku-morimori-gym`
   - Database Password: 「Generate a password」で作り、**自分だけが分かる所に保管**（チャットに貼らない）
   - Region: **Northeast Asia (Tokyo)**
3. 作成完了まで1〜2分待つ

## 2. データベースを作る（SQL を1回流す）

1. 左メニュー「SQL Editor」→「New query」
2. 次のファイルの中身を全部コピーして貼り付け
   https://github.com/machamp17/kinniku-morimori-gym/blob/main/supabase/schema.sql （「Raw」を押すとコピーしやすい）
3. 「Run」→ 下に `Success. No rows returned` と出ればOK
   - 何度実行しても壊れないように作ってあります

## 3. ログインのリンク先を設定

左メニュー「Authentication」→「URL Configuration」

- **Site URL**: `https://machamp17.github.io/kinniku-morimori-gym/`
- **Redirect URLs** に次の2つを「Add URL」で追加
  - `https://machamp17.github.io/kinniku-morimori-gym/`
  - `http://localhost:5191/`

「Authentication」→「Sign In / Providers」→ Email が有効、「Confirm email」がオンであることを確認（初期設定のままでOK）。

## 4. 接続先を教える

左メニュー「Project Settings」→「API Keys」（または「Data API」）

- **Project URL**（`https://xxxx.supabase.co`）
- **Publishable key**（`sb_publishable_...`）。古い画面では **anon public** key

この2つはアプリに組み込まれて誰でも見られる前提の値なので、チャットに貼って大丈夫です。
**`secret` / `service_role` と書かれた鍵は絶対に貼らないでください。**

## 知っておくこと

- Supabase 標準のメール送信は1時間あたりの送信数が少ない制限があります。身内で試す分には十分ですが、一般公開する時は自前のメール送信（SMTP）の設定が必要です
- 無料プランはしばらく使われないとプロジェクトが一時停止されることがあります
- 招待した人だけにしたい時は「Authentication」→「Sign In / Providers」で新規登録を止められます（アカウントは「Users」から招待）
- 通報は「Table Editor」→ `reports` で確認できます。対応する相手を共有ジムから外す時は `profiles` の `suspended` を true にします
