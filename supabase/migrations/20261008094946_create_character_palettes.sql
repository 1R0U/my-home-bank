-- Issue #381 / #383: キャラクターの種類ごとに、本人が選んだ色を保存する。
-- 種類の選択は引き続き character_appearances に保存し、旧色列も互換用に残す。
-- 色が未設定の枠は NULL とし、アプリ側で種類ごとの既定色へフォールバックする。

create table if not exists public.character_palettes (
  user_id uuid not null references public.users (id) on delete cascade,
  character_type text not null,
  accent_color text,
  hair_color text,
  skin_color text,
  updated_at timestamptz not null default now(),

  primary key (user_id, character_type),
  constraint character_palettes_type_allowed
    check (character_type in ('frog', 'cat', 'hamster', 'rabbit')),
  constraint character_palettes_accent_color_format
    check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint character_palettes_hair_color_format
    check (hair_color is null or hair_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint character_palettes_skin_color_format
    check (skin_color is null or skin_color ~ '^#[0-9a-fA-F]{6}$')
);

alter table public.character_palettes enable row level security;

create policy character_palettes_select_self on public.character_palettes
for select to authenticated using (user_id = auth.uid());
create policy character_palettes_insert_self on public.character_palettes
for insert to authenticated with check (user_id = auth.uid());
create policy character_palettes_update_self on public.character_palettes
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.character_palettes from anon, authenticated;
grant select, insert, update on table public.character_palettes to authenticated;
