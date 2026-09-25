-- Issue #277: 生年月日と性別を利用者ごとに保存する -----------------------------
--
-- 設定画面の「生年月日」「性別」は、これまでコードに直書きした固定値で、誰がログインしても
-- 同じ内容が出ていた。本人が設定・変更できるよう、users に列を足す。
--
-- どちらも任意項目。null は「未設定」を表す（性別の「答えない」も null で表す）。
-- 既存の行は null のまま（補完しない）。列の追加だけなので、既存データが新しい制約を
-- 満たさないことはない。

alter table public.users
  add column if not exists birth_date date,
  add column if not exists gender text;

-- 値の種類を絞る。表示名（男の子・女の子など）はアプリ側（lib/profile.ts）が持つ。
alter table public.users drop constraint if exists users_gender_check;
alter table public.users
  add constraint users_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));

-- 明らかに誤った入力だけを弾く。未来の日付はアプリ側で弾く
-- （CHECK に current_date を使うと、日付が変わっても再評価されない制約になるため使わない）。
alter table public.users drop constraint if exists users_birth_date_check;
alter table public.users
  add constraint users_birth_date_check
  check (birth_date is null or birth_date >= date '1900-01-01');

-- 本人だけが更新できる（RLS の users_update_self が行を本人に絞っている）。
-- 読み取りは users_select_family のとおり、本人と同じ家族に限られる。
grant update (birth_date, gender) on table public.users to authenticated;
