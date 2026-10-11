-- Issue #381 / #383: 旧形式で保存されたカエル用の色を種類別テーブルへ補完する。
-- 旧色はカエルだけに適用されていたため、現在選択中の種類に関係なく frog へコピーする。
-- 全枠未設定の行は保存せず、既定色へのフォールバックを維持する。
-- 新形式で既に保存済みの frog は上書きしないため、この補完は再実行しても安全。
-- 旧列は旧クライアントとの互換用に残し、削除・更新しない。

insert into public.character_palettes (
  user_id, character_type, accent_color, hair_color, skin_color, updated_at
)
select user_id, 'frog', accent_color, hair_color, skin_color, updated_at
from public.character_appearances
where accent_color is not null or hair_color is not null or skin_color is not null
on conflict (user_id, character_type) do nothing;
