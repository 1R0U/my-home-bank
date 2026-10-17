-- 以前の3Dの家の中（Issue #235）に「かざる」で置いた装飾を片付ける（Issue #444）。
--
-- 家の中を町と同じシーンの中の新しい部屋に作り直し、以前の家の中（1階・離れ・2階）は無くなった。
-- そこに置かれていた装飾は、部屋の外に浮いたまま残り、
--   - 町の物として扱われ、町で「かざる」を使うたびに到達判定の範囲が広がって重くなる
--   - 子供は歩いて近づけないので、しまうこともできない
-- ことになる（PR #451 の 1R0U さんレビュー指摘）。
--
-- 行を消すことは、アプリで装飾を「しまう」のと同じ。持ち物（所持数）は減らないので、
-- 片付けた装飾はもう一度置ける（置いた数 ≤ 持っている数 は check_decoration_ownership が見ている）。
--
-- 範囲は以前の家の中の区画（壁の外周）で、lib/rpg-hub/houseInterior.ts の
-- LEGACY_HOUSE_ZONE_BOUNDS と同じ値。新しい部屋（z が -80.3 〜 -69.9）とは重ならない。
--   - 1階・離れ: x が -6 〜 12、z が -66 〜 -51
--   - 2階:       x が -6 〜 6、 z が -96 〜 -84
-- 町の自然物を散らす範囲（±34）の外で、町なかに置いた装飾は含まれない。

delete from public.placed_decorations
where (position_x between -6 and 12 and position_z between -66 and -51)
   or (position_x between -6 and 6 and position_z between -96 and -84);
