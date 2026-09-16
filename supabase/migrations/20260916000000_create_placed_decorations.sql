-- Issue #223: 庭に置いた装飾を保存する ------------------------------------------
--
-- 【何を保存するか】
-- 置いた装飾の「どれを・どこに・どの向きで・どの大きさで」だけを持つ。
-- **見た目（形・色・当たり判定の大きさ）はアプリ側のカタログ**
-- （lib/rpg-hub/catalog.ts）が持ち、DBには入れない。
-- 見た目を直すのにマイグレーションが要る状態にしたくないため。
--
-- 【町の固定物は入れない】
-- 建物・道・散らした木は lib/rpg-hub/mapObjects.ts の定数のまま。
-- ここに入れると、町のレイアウトを直すのにマイグレーションが必要になる。
-- 既存のテスト（道が端から端まで歩ける、座標が重複しない等）も定数を前提にしている。
--
-- 【y座標を持たない理由】
-- 地面に接する高さは「カタログの halfHeight × scale」から決まる。
-- 保存してしまうと、形を作り直したときに古い高さのまま宙に浮く。
--
-- 【家庭ごとの分離について】
-- family の概念がまだ無いため（Issue #208）、置いた人（users.id）に紐づける。
-- 1 Supabase プロジェクト＝1家庭の前提のまま。

create table if not exists public.placed_decorations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- カタログのアセットID（例: decoration-tree）。アプリ側で許可リストと突き合わせる。
  -- ここでCHECK制約にすると、アセットを増やすたびにマイグレーションが要るため付けない。
  asset_id text not null,
  position_x numeric not null,
  position_z numeric not null,
  -- Y軸まわりの回転（ラジアン）
  rotation_y numeric not null default 0,
  scale numeric not null default 1,
  created_at timestamptz not null default now(),

  constraint placed_decorations_asset_id_not_empty check (length(btrim(asset_id)) > 0),
  -- 0以下だと潰れて見えなくなり、負だと裏返る。上限を切るのは、極端に大きいと
  -- 当たり判定（カタログの size × scale）が町を塞いでどの建物にも行けなくなるため。
  --
  -- **`> 0` ではなく between にしている。** numeric の 'NaN' は「すべての値より大きい」
  -- 扱いなので `scale > 0` をすり抜ける。between なら NaN も落ちる
  -- （position_x / position_z が between なのも同じ理由）。
  constraint placed_decorations_scale_in_range check (scale between 0.25 and 3),
  -- 町の広さから見て現実的な範囲。極端な値で遠くへ飛ばされるのを防ぐ
  constraint placed_decorations_position_in_range check (
    position_x between -100 and 100 and position_z between -100 and 100
  )
);

-- 画面を開くたびに「その人が置いたもの」を全部引くため、user_id で引ける状態にする。
create index if not exists placed_decorations_user_id_idx
  on public.placed_decorations (user_id);
