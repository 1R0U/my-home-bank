-- Issue #356: タスクを「必須」と「推奨」から選べるようにする ---------------------
--
-- quests.is_required で、毎日必ずやってほしいタスク（必須 = true）と、
-- できればやってほしいタスク（推奨 = false）を区別する。
--
-- - 既存のタスクは、作成時に区別を選んでいないため「推奨」(false) として扱う。
--   必須を後から付けると、親が意図していない「必ずやること」が子供の画面に出てしまうため。
-- - デイリー/ウィークリー/限定（category）とは別の軸として持つ（どの区分でも必須にできる）。
-- - 必須をやらなかったときの扱い（通知・連続記録への影響）はまだ決めていない。
--   この列は表示用の区別だけを表し、報酬や承認の処理は変えない。

alter table public.quests
  add column if not exists is_required boolean not null default false;

-- quests への INSERT は列単位で許可している（20260923000300_enable_family_rls.sql）。
-- 親がタスク作成時に必須/推奨を指定できるよう、新しい列も許可に加える。
-- UPDATE は子供の受注用に status / assigned_to だけを許可しているため、ここには加えない。
grant insert (is_required) on public.quests to authenticated;
