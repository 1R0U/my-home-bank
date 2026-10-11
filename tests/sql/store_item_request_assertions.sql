-- Issue #131: approve_store_item_request / reject_store_item_request の
-- 認証・親ロール・家庭境界チェックと、承認・拒否の実処理を実DBで検証する。
--
-- レビュー指摘（1R0Uさんレビュー）: 「関数が存在するか」の確認だけでは、
-- family_id 未設定による not-null 制約違反のような実行時の不具合を検知できない。
-- tests/sql/treasury_payments_assertions.sql の approve_quest_log の検証と
-- 同じ方針（実際にRPCを呼んで結果を確認する）でカバーする。

\set ON_ERROR_STOP on

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
end;
$$;

create function pg_temp.assert_rejected(
  p_sql text,
  p_expected_sqlstate text,
  p_expected_message text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_message text;
  v_sqlstate text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text, v_sqlstate = returned_sqlstate;
    if v_sqlstate <> p_expected_sqlstate or v_message is distinct from p_expected_message then
      raise exception '想定外のエラー（%）: [%] %', p_label, v_sqlstate, v_message;
    end if;
    return;
  end;
  raise exception 'アサーション失敗（拒否されるはずが成功）: %', p_label;
end;
$$;

select pg_temp.assert(
  not has_function_privilege('anon', 'public.approve_store_item_request(uuid,uuid,integer)', 'EXECUTE')
    and has_function_privilege(
      'authenticated', 'public.approve_store_item_request(uuid,uuid,integer)', 'EXECUTE'
    ),
  '商品追加申請の承認RPCは認証済み利用者だけが実行できる'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.reject_store_item_request(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.reject_store_item_request(uuid,uuid)', 'EXECUTE'),
  '商品追加申請の却下RPCは認証済み利用者だけが実行できる'
);

insert into public.families (id, name) values
  ('c1000000-0000-4000-8000-000000000001', '申請検証家族A'),
  ('c1000000-0000-4000-8000-000000000002', '申請検証家族B');

insert into public.users (id, family_id, name, role, balance) values
  ('c1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', '親A', 'parent', 0),
  ('c1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000001', '子A', 'child', 0),
  ('c1000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000002', '親B', 'parent', 0);

insert into public.guild_treasuries (
  family_id, balance, initial_supply, total_supply, minimum_reserve_rate
) values
  ('c1000000-0000-4000-8000-000000000001', 0, 0, 0, 0.2000),
  ('c1000000-0000-4000-8000-000000000002', 0, 0, 0, 0.2000);

insert into public.store_item_requests (id, family_id, requested_by, title, description, reason, image_url) values
  (
    'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000012', '申請検証アイテム1', '説明1', '理由1', ''
  ),
  (
    'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000012', '申請検証アイテム2', '説明2', '理由2', ''
  ),
  (
    -- アップロード後の公開URL（Issue #311）。承認時に store_items.image_url へ
    -- そのまま引き継がれることを検証する。
    'c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000012', '申請検証アイテム3（画像あり）', '説明3', '理由3',
    'https://example.supabase.co/storage/v1/object/public/store-item-images/c1000000-0000-4000-8000-000000000001/photo.jpg'
  ),
  (
    -- Issue #311より前の、申請した端末内だけで解決できるパス。承認してもそのまま
    -- 引き継がず null にすることを検証する。
    'c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000012', '申請検証アイテム4（旧形式の画像）', '説明4', '理由4',
    'file:///data/user/0/com.example/cache/photo.jpg'
  );

\echo '=== 1. ログイン中の利用者と異なる承認者は拒否される ==='

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 100
    )$$,
  'P0001', '承認者がログイン利用者と一致しません',
  'ログイン中の利用者と異なる親としての承認'
);

\echo '=== 2. 子どもは承認できない ==='

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000012', 100
    )$$,
  'P0001', '親だけが商品追加申請を承認できます',
  '子どもによる承認'
);

\echo '=== 3. 別の家庭の親は承認できない ==='

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000021', 100
    )$$,
  'P0001', '別の家庭の申請は操作できません',
  '別の家庭の親による承認'
);

\echo '=== 4. 価格が1未満・NULLだと拒否される ==='

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 0
    )$$,
  'P0001', '価格は1以上の整数で指定してください',
  '価格0での承認'
);
select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', null
    )$$,
  'P0001', '価格は1以上の整数で指定してください',
  '価格NULLでの承認'
);

\echo '=== 5. 正しい親が承認すると、申請がapprovedになりstore_itemsが作られる ==='

select public.approve_store_item_request(
  'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 150
);

do $$
declare
  v_status text;
  v_approved_by uuid;
begin
  select status, approved_by into v_status, v_approved_by
  from public.store_item_requests
  where id = 'c2000000-0000-4000-8000-000000000001';
  perform pg_temp.assert(v_status = 'approved', format('申請がapprovedになる（実際: %s）', v_status));
  perform pg_temp.assert(
    v_approved_by = 'c1000000-0000-4000-8000-000000000011',
    '承認者が記録される'
  );

  perform pg_temp.assert(
    exists (
      select 1 from public.store_items
      where family_id = 'c1000000-0000-4000-8000-000000000001'
        and requested_by = 'c1000000-0000-4000-8000-000000000012'
        and title = '申請検証アイテム1'
        and description = '説明1'
        and price = 150
        and stock = public.store_unlimited_stock()
    ),
    '承認した申請の内容でstore_itemsが作られる（family_id・requested_by・price・stockが期待どおり）'
  );
end;
$$;

\echo '=== 5b. アップロード後の公開URLは、承認時にそのまま商品の画像へ引き継がれる（PR #334 1R0Uさんレビュー指摘） ==='

select public.approve_store_item_request(
  'c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000011', 150
);

do $$
begin
  perform pg_temp.assert(
    exists (
      select 1 from public.store_items
      where title = '申請検証アイテム3（画像あり）'
        and image_url =
          'https://example.supabase.co/storage/v1/object/public/store-item-images/c1000000-0000-4000-8000-000000000001/photo.jpg'
    ),
    '承認時に申請の公開URLがstore_items.image_urlへ引き継がれる'
  );
end;
$$;

\echo '=== 5c. Issue #311より前の端末内パス（file://...）は、承認してもnullのまま（他端末から解決できないため） ==='

select public.approve_store_item_request(
  'c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000011', 150
);

do $$
begin
  perform pg_temp.assert(
    exists (
      select 1 from public.store_items
      where title = '申請検証アイテム4（旧形式の画像）' and image_url is null
    ),
    '旧形式（file://...）の画像URLは承認してもnullのまま引き継がれない'
  );
end;
$$;

\echo '=== 6. 処理済みの申請への再承認・拒否は拒否される ==='

select pg_temp.assert_rejected(
  $$select public.approve_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 150
    )$$,
  'ST0AP', '対象の申請が見つからないか、すでに処理されています',
  '承認済み申請への再承認'
);
select pg_temp.assert_rejected(
  $$select public.reject_store_item_request(
      'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011'
    )$$,
  'ST0AP', '対象の申請が見つからないか、すでに処理されています',
  '承認済み申請への拒否'
);

\echo '=== 7. 正しい親が拒否すると、申請がrejectedになりstore_itemsは作られない ==='

select public.reject_store_item_request(
  'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000011'
);

do $$
declare
  v_status text;
begin
  select status into v_status
  from public.store_item_requests
  where id = 'c2000000-0000-4000-8000-000000000002';
  perform pg_temp.assert(v_status = 'rejected', format('申請がrejectedになる（実際: %s）', v_status));

  perform pg_temp.assert(
    not exists (
      select 1 from public.store_items where title = '申請検証アイテム2'
    ),
    '拒否した申請からはstore_itemsが作られない'
  );
end;
$$;

\echo '=== 8. 拒否済みの申請への再拒否も拒否される ==='

select pg_temp.assert_rejected(
  $$select public.reject_store_item_request(
      'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000011'
    )$$,
  'ST0AP', '対象の申請が見つからないか、すでに処理されています',
  '拒否済み申請への再拒否'
);

\echo '=== すべての検証を通過しました ==='

rollback;
