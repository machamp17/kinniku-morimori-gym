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

## 5. 自分を「運営」にする（通報の確認・ひとことの削除ができるようになる）

アプリにログインして初期設定まで終えてから、「SQL Editor」で1回だけ実行します。

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'あなたのメールアドレス'
on conflict do nothing;
```

アプリを開き直すと、**設定 → 運営メニュー**が出ます（管理者にだけ表示されます）。ここでできること:

- **通報**: 誰のどのひとことが、どんな理由で通報されたか。その場で「ひとことを削除」「共有ジムから外す」「対応済み」
- **ひとこと**: 通報が無くても、直近7日の公開中のひとことを見回れます
- **使えない言葉**: 言葉を足すと、その言葉を含むひとことと表示名が保存できなくなります（全角・カタカナ・伏せ字にしても弾きます）

アプリを使わずダッシュボードから直接やる場合:

```sql
-- ひとことだけ消す（トレーニングの記録は残す）
update public.workouts set public_comment = null where id = 'ここに workout の id';
-- 共有ジムから外す / 戻す
update public.profiles set suspended = true  where user_id = 'ここに user の id';
update public.profiles set suspended = false where user_id = 'ここに user の id';
-- 使えない言葉を足す（ひらがな・小文字・記号なしで入れる）
insert into public.ng_words (word) values ('ばかやろう') on conflict do nothing;
```

## 知っておくこと

- Supabase 標準のメール送信は1時間あたりの送信数が少ない制限があります。身内で試す分には十分ですが、一般公開する時は自前のメール送信（SMTP）の設定が必要です
- 無料プランはしばらく使われないとプロジェクトが一時停止されることがあります
- 招待した人だけにしたい時は「Authentication」→「Sign In / Providers」で新規登録を止められます（アカウントは「Users」から招待）
- 通報は「Table Editor」→ `reports` でも確認できます（運営メニューには未対応のものだけ出ます）
- 管理者はアプリからは増やせません。上の SQL でだけ増やせます
