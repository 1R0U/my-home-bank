-- Issue #255: 家族一人ひとりを我が家タウンのNPCとして立たせるため、同じ家庭の人の
-- 見た目（色・装備）を読めるようにする ------------------------------------------
--
-- 【何を許すか】
-- character_appearances（キャラクターの種類・色）と equipped_items（装備）の「読み取り」だけを、
-- 同じ家庭の人へ広げる。書き込み（insert / update / delete）は本人のまま変えない。
--
-- 【なぜ広げてよいか】
-- どちらも町に立つ家族のキャラクターの見た目で、家族の画面に映すためのもの。
-- 家族の名前・お財布残高（users）やクエスト（quests）は、すでに家庭の範囲で読める。
-- 別の家庭の人の見た目は、これまでどおり読めない。
--
-- 【owned_items は広げない】
-- 持ち物の一覧は町には映らない。装備は「持っているものしか装備できない」ことを
-- 外部キーが担保しているので、家族NPCの装備は equipped_items だけで組み立てられる。
--
-- 既存の *_select_self ポリシーは残す。ポリシーは OR で合わさるため、家庭に
-- 未所属の人（current_user_family_id() が null）も、自分の行はこれまでどおり読める。

create policy character_appearances_select_family on public.character_appearances
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = character_appearances.user_id
      and u.family_id = public.current_user_family_id()
  )
);

create policy equipped_items_select_family on public.equipped_items
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = equipped_items.user_id
      and u.family_id = public.current_user_family_id()
  )
);
