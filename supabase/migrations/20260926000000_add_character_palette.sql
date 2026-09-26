-- Issue #253: プレイヤーキャラクターの色（3枠）を保存する -----------------------
--
-- 【どこに持たせるか】
-- character_appearances（#287で作成、種類だけを持つ）に列を足す。形（character_type）
-- と色（palette）は別の関心事だが、Issue #253本文が例示したとおり「user_idを主キーに
-- した1人1行」という同じ形の永続化なので、同じテーブルにまとめる。
--
-- 【CHECK制約を「形式」だけにする理由】
-- character_type と違い、色の候補（アプリ側の PALETTE_COLOR_OPTIONS）は今後増減しうる。
-- CHECK制約で許可する16進コードを列挙すると、候補を増やすたびにマイグレーションが
-- 要る状態になってしまう。ここでは16進カラーコードの「形式」だけを確認し、候補
-- （許可値）への絞り込みはアプリ側（lib/rpg-hub/palette.ts）で行う。
--
-- 【見た目の定義について】
-- 形（アンカー・パーツ）と同じく、色を実際にどのパーツへ当てるか
-- （skin/accent/hairがどの部品を指すか）はアプリ側のカタログが持つ。DBには
-- 3枠ぶんの色の値だけを入れる（placed_decorations / owned_items と同じ考え方）。
--
-- 【未設定はNULL】
-- 選んだことが無い枠はNULLのままにし、アプリ側で既定色にフォールバックする
-- （character_type のような列defaultは使わない。枠ごとに既定色が違うため）。
--
-- RLS・付与済み権限は character_appearances のものがそのまま列にも及ぶため、
-- ここでは変更しない（行単位のポリシーであり、列を追加しても対象は変わらない）。

alter table public.character_appearances
  add column if not exists accent_color text,
  add column if not exists hair_color text,
  add column if not exists skin_color text;

alter table public.character_appearances
  add constraint character_appearances_accent_color_format
    check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint character_appearances_hair_color_format
    check (hair_color is null or hair_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint character_appearances_skin_color_format
    check (skin_color is null or skin_color ~ '^#[0-9a-fA-F]{6}$');
