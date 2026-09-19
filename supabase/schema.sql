-- 筋肉モリモリジム データベース（Supabase / PostgreSQL）
-- Supabase の SQL Editor に全文を貼り付けて Run。何度実行しても壊れないように書いてある。
-- 方針: 私用データは本人だけが読み書き（RLS）。共有ジムは公開してよい列だけを返す関数経由。
--       24時間の期限・当日/前日判定・応援の一意性はサーバーの時刻と制約で決める。

/* ------------------------------------------------------------
 * プロフィール（表示名・キャラの見た目・公開設定）
 * ------------------------------------------------------------ */
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  look jsonb not null default '{}'::jsonb,
  title_id text not null default 't_first' check (char_length(title_id) <= 40),
  join_gym boolean not null default false,
  show_name boolean not null default false,
  show_content boolean not null default false,
  timezone text not null default 'Asia/Tokyo',
  onboarded_at timestamptz,
  suspended boolean not null default false, -- 運営が通報対応で共有から外す時に使う
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* ------------------------------------------------------------
 * トレーニング記録（1セッション = 1行。種目とセットは entries に入れる）
 * entries: [{ id, exId, sets: [{ id, kg, reps, addKg, assistKg, sec, min, km, done }] }]
 * ------------------------------------------------------------ */
create table if not exists public.workouts (
  id uuid primary key,
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  record_date date not null,
  timezone text not null default 'Asia/Tokyo',
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and pg_column_size(entries) < 64000),
  public_comment text check (char_length(public_comment) <= 40),
  first_completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz
);
create index if not exists workouts_user_date on public.workouts (user_id, record_date desc);
create index if not exists workouts_recent on public.workouts (first_completed_at desc) where deleted_at is null;

/* ------------------------------------------------------------
 * からだ記録（1日1件。項目ごとに任意。他人には一切返さない）
 * ------------------------------------------------------------ */
create table if not exists public.body_records (
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  record_date date not null,
  weight numeric(5, 1) check (weight > 0 and weight < 500),
  kcal integer check (kcal >= 0 and kcal < 100000),
  p numeric(6, 1) check (p >= 0 and p < 10000),
  f numeric(6, 1) check (f >= 0 and f < 10000),
  c numeric(6, 1) check (c >= 0 and c < 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_date)
);

/* ------------------------------------------------------------
 * ナイスセット・非表示・通報
 * ------------------------------------------------------------ */
create table if not exists public.nice_sets (
  from_user uuid not null default auth.uid () references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, workout_id)
);
create table if not exists public.blocks (
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  blocked_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user)
);
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid () references auth.users (id) on delete cascade,
  target_user uuid not null references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------
 * 書き込み時のルール（トリガー）
 * ------------------------------------------------------------ */
-- 記録: 作成時刻・初回完了時刻はサーバーが決める。編集で24時間の期限を延ばさない。
-- version が一致しない更新は拒否（別の端末で先に更新された＝競合）。未来の日付は不可。
create or replace function public.workouts_before_write () returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.record_date > (now() at time zone coalesce(new.timezone, 'Asia/Tokyo'))::date then
    raise exception 'future_date' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.first_completed_at := now();
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
  else
    if new.version is distinct from old.version then
      raise exception 'version_conflict' using errcode = 'P0001';
    end if;
    new.user_id := old.user_id;
    new.first_completed_at := old.first_completed_at;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;
drop trigger if exists workouts_before_write on public.workouts;
create trigger workouts_before_write before insert or update on public.workouts
for each row execute function public.workouts_before_write ();

create or replace function public.touch_updated_at () returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists body_touch on public.body_records;
create trigger body_touch before insert or update on public.body_records
for each row execute function public.touch_updated_at ();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
for each row execute function public.touch_updated_at ();

-- 運営用の列は本人が変更できない（アプリ経由＝ログイン中の時だけ制限。運営はダッシュボードの SQL で変更できる）
create or replace function public.profiles_guard () returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid () is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.suspended := old.suspended;
    new.user_id := old.user_id;
  else
    new.suspended := false;
    new.user_id := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
for each row execute function public.profiles_guard ();

/* ------------------------------------------------------------
 * 行単位の権限（RLS）: 本人の行だけ
 * ------------------------------------------------------------ */
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.body_records enable row level security;
alter table public.nice_sets enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

drop policy if exists "own body" on public.body_records;
create policy "own body" on public.body_records for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

-- 応援・通報は関数経由だけで書く。本人の応援は読める
drop policy if exists "own nice read" on public.nice_sets;
create policy "own nice read" on public.nice_sets for select to authenticated using (from_user = (select auth.uid ()));

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));
-- reports はポリシーなし（直接の読み書き不可。関数経由のみ。内容は運営がダッシュボードで確認）

/* ------------------------------------------------------------
 * 共有ジム: 公開してよい列だけを返す
 * 条件: ログイン中 / 相手が参加ON・停止されていない / 初回完了から24時間以内（サーバー時刻）
 *       記録日が保存時の相手の日付で当日か前日 / 削除されていない / 自分が非表示にしていない
 * 体重・カロリー・メール・内部IDは返さない。名前・内容はそれぞれ公開ONの時だけ。
 * ------------------------------------------------------------ */
create or replace function public.gym_now ()
returns table (
  workout_id uuid, is_me boolean, display_name text, title_id text, look jsonb,
  recorded_at timestamptz, comment text, entries jsonb, nice_count integer, niced boolean
)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (w.user_id) w.*
    from public.workouts w
    join public.profiles p on p.user_id = w.user_id
    where auth.uid () is not null
      and p.join_gym and not p.suspended
      and w.deleted_at is null
      and w.first_completed_at > now() - interval '24 hours'
      and w.record_date >= (w.first_completed_at at time zone w.timezone)::date - 1
      and not exists (select 1 from public.blocks b where b.user_id = auth.uid () and b.blocked_user = w.user_id)
    order by w.user_id, w.first_completed_at desc
  )
  select
    l.id,
    l.user_id = auth.uid (),
    case when p.show_name then p.display_name else 'トレーニー' end,
    p.title_id,
    p.look,
    l.first_completed_at,
    l.public_comment,
    case when p.show_content then l.entries else null end,
    (select count(*)::integer from public.nice_sets n where n.workout_id = l.id),
    exists (select 1 from public.nice_sets n where n.workout_id = l.id and n.from_user = auth.uid ())
  from latest l
  join public.profiles p on p.user_id = l.user_id
  order by l.first_completed_at desc
  limit 200
$$;

-- ナイスセット: 1つの記録に1人1回。自分には不可。期限内の公開記録だけ。押すたびに付ける/外す
create or replace function public.toggle_nice (p_workout uuid)
returns table (niced boolean, nice_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  select w.user_id into owner
  from public.workouts w join public.profiles p on p.user_id = w.user_id
  where w.id = p_workout and w.deleted_at is null and p.join_gym and not p.suspended
    and w.first_completed_at > now() - interval '24 hours';
  if owner is null then raise exception 'not_available'; end if;
  if owner = auth.uid () then raise exception 'own_record'; end if;
  if exists (select 1 from public.nice_sets where from_user = auth.uid () and workout_id = p_workout) then
    delete from public.nice_sets where from_user = auth.uid () and workout_id = p_workout;
  else
    -- 連打対策: 1分に30回まで
    if (select count(*) from public.nice_sets where from_user = auth.uid () and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'rate_limited';
    end if;
    insert into public.nice_sets (from_user, workout_id) values (auth.uid (), p_workout);
  end if;
  return query select
    exists (select 1 from public.nice_sets where from_user = auth.uid () and workout_id = p_workout),
    (select count(*)::integer from public.nice_sets where workout_id = p_workout);
end $$;

-- 非表示: 相手の内部IDを知らなくても、ジムに出ている記録から相手を非表示にできる
create or replace function public.block_by_workout (p_workout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  select user_id into owner from public.workouts where id = p_workout;
  if owner is null or owner = auth.uid () then raise exception 'not_available'; end if;
  insert into public.blocks (user_id, blocked_user) values (auth.uid (), owner) on conflict do nothing;
end $$;

-- 通報: 運営確認キューへ。1時間に10件まで
create or replace function public.report_workout (p_workout uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  if (select count(*) from public.reports where reporter = auth.uid () and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;
  select user_id into owner from public.workouts where id = p_workout;
  if owner is null or owner = auth.uid () then raise exception 'not_available'; end if;
  insert into public.reports (reporter, target_user, workout_id, reason) values (auth.uid (), owner, p_workout, left(p_reason, 200));
end $$;

-- 関数を呼べるのはログイン中の利用者だけ
revoke all on function public.gym_now () from public, anon;
revoke all on function public.toggle_nice (uuid) from public, anon;
revoke all on function public.block_by_workout (uuid) from public, anon;
revoke all on function public.report_workout (uuid, text) from public, anon;
grant execute on function public.gym_now () to authenticated;
grant execute on function public.toggle_nice (uuid) to authenticated;
grant execute on function public.block_by_workout (uuid) to authenticated;
grant execute on function public.report_workout (uuid, text) to authenticated;
