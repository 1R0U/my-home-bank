import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkPullRequestMigrations, createGitHubRequest, formatPullRequestMigrationProblems } from '../scripts/check-pr-migrations.mjs';

const VERSION = '20261005123000';
const CURRENT_FILE = `supabase/migrations/${VERSION}_current_change.sql`;
const OTHER_FILE = `supabase/migrations/${VERSION}_other_change.sql`;
const OLDER_FILE = 'supabase/migrations/20261005122959_older_change.sql';
const NEWER_FILE = 'supabase/migrations/20261006123000_newer_change.sql';
const PREFIX = '/repos/example/bank';

function file(filename = CURRENT_FILE, status = 'added', sha = 'blob-current') {
  return { filename, status, sha };
}

function fixture({ currentFiles = [file()], mainFiles = [], currentCount } = {}) {
  const event = { number: 345, pull_request: { head: { sha: 'head-current' }, base: { ref: 'main' } } };
  const current = { number: 345, state: 'open', head: { sha: 'head-current' }, base: { ref: 'main' }, changed_files: currentCount ?? currentFiles.length };
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path === `${PREFIX}/pulls/345`) return current;
    if (path === `${PREFIX}/git/ref/heads/main`) return { object: { sha: 'base-head' } };
    if (path === `${PREFIX}/git/trees/base-head`) return { tree: [{ path: 'supabase', type: 'tree', sha: 'supabase-tree' }], truncated: false };
    if (path === `${PREFIX}/git/trees/supabase-tree`) return { tree: [{ path: 'migrations', type: 'tree', sha: 'migrations-tree' }], truncated: false };
    if (path === `${PREFIX}/git/trees/migrations-tree`) return {
      tree: mainFiles.map((entry) => ({ path: entry.filename.slice('supabase/migrations/'.length), type: 'blob', sha: entry.sha })), truncated: false,
    };
    const parsed = new URL(`https://api.github.com${path}`);
    if (parsed.pathname === `${PREFIX}/pulls/345/files`) {
      const page = Number(parsed.searchParams.get('page'));
      return currentFiles.slice((page - 1) * 100, page * 100);
    }
    // 他のPRの情報・一覧にはアクセスさせない。
    throw new Error(`テストで想定しないAPI: ${path}`);
  };
  return { event, current, request, calls, options: { event, repository: 'example/bank', request } };
}

test('最新mainの同じ番号を検出し、番号・双方の名前・再採番コマンドを表示する', async () => {
  const result = await checkPullRequestMigrations(fixture({ mainFiles: [file(OTHER_FILE, 'added', 'blob-main')] }).options);
  assert.deepEqual(result.conflicts.map(({ source }) => source), ['main']);
  assert.equal(result.baseSha, 'base-head');
  assert.equal(result.outOfOrder[0].latestVersion, VERSION);
  const messages = formatPullRequestMigrationProblems(result);
  assert.ok(messages[0].includes(VERSION) && messages[0].includes(CURRENT_FILE) && messages[0].includes(OTHER_FILE));
  assert.ok(messages[1].includes('npm run migration:new'));
});

test('番号が重複しなくてもmainの最大番号より古い追加を失敗させる', async () => {
  const result = await checkPullRequestMigrations(fixture({ mainFiles: [file(NEWER_FILE), file(OLDER_FILE)] }).options);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.outOfOrder, [{ version: VERSION, file: CURRENT_FILE, latestVersion: '20261006123000' }]);
  const [message] = formatPullRequestMigrationProblems(result);
  assert.ok(message.includes(CURRENT_FILE) && message.includes('main の最新番号 20261006123000') && message.includes('npm run migration:new'));
});

test('mainの最大番号より新しい追加と、mainにSQLがない場合は成功する', async () => {
  for (const mainFiles of [[], [file(OLDER_FILE)]]) {
    const result = await checkPullRequestMigrations(fixture({ mainFiles }).options);
    assert.equal(result.migrationCount, 1);
    assert.deepEqual(formatPullRequestMigrationProblems(result), []);
  }
});

test('同じパス・同じ内容でmainへ取り込み済みのSQLは古い番号でも除外する', async () => {
  const setup = fixture({ mainFiles: [file(), file(NEWER_FILE)] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 0);
  assert.deepEqual(formatPullRequestMigrationProblems(result), []);
  assert.equal(setup.calls.filter((path) => path.endsWith('/git/ref/heads/main')).length, 2);
});

test('取り込み済みSQLが混ざっていても未取り込みの古い番号は検出する', async () => {
  const result = await checkPullRequestMigrations(fixture({ currentFiles: [file(), file(OLDER_FILE)], mainFiles: [file(), file(NEWER_FILE)] }).options);
  assert.equal(result.migrationCount, 1);
  assert.equal(result.outOfOrder.length, 1);
  assert.equal(result.outOfOrder[0].file, OLDER_FILE);
});

test('同一ファイル名でもSQLのblobが異なる場合は取り込み済みにしない', async () => {
  const result = await checkPullRequestMigrations(fixture({ mainFiles: [file(CURRENT_FILE, 'added', 'different-blob')] }).options);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.outOfOrder.length, 1);
  assert.equal(result.migrationCount, 1);
});

test('改名・コピー先を検査し、削除・既存変更・別ディレクトリは除外する', async () => {
  const result = await checkPullRequestMigrations(fixture({
    currentFiles: [
      { ...file(CURRENT_FILE, 'renamed'), previous_filename: OLDER_FILE }, file(OLDER_FILE, 'copied'),
      file('docs/20261005123000_notes.sql'), file(OTHER_FILE, 'removed'), file(NEWER_FILE, 'modified'),
    ], mainFiles: [file(OTHER_FILE)],
  }).options);
  assert.equal(result.migrationCount, 2);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.outOfOrder.map(({ file }) => file), [CURRENT_FILE, OLDER_FILE]);
});

test('追加のないPRはmainや他PRのAPI取得に依存せず終了する', async () => {
  const setup = fixture({ currentFiles: [file(CURRENT_FILE, 'modified')] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 0);
  assert.equal(setup.calls.length, 2);
  assert.ok(setup.calls.every((path) => path.includes('/pulls/345')));
});

test('現在のPRの変更ファイル一覧は2ページ目以降も照合する', async () => {
  const setup = fixture({ currentFiles: [...Array.from({ length: 100 }, (_, index) => file(`docs/file-${index}.md`)), file()], mainFiles: [file(OTHER_FILE)] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.conflicts.length, 1);
  assert.ok(setup.calls.includes(`${PREFIX}/pulls/345/files?per_page=100&page=2`));
});

test('現在のPRが差分APIの上限を超えた場合は取得漏れを成功にしない', async () => {
  const setup = fixture({ currentCount: 3001 });
  await assert.rejects(checkPullRequestMigrations(setup.options), /上限（3000件）.*PRを分割/);
  assert.deepEqual(setup.calls, [`${PREFIX}/pulls/345`]);
});

test('他PRの重複番号・巨大差分・head更新・新規作成は現在の検査に影響しない', async () => {
  const setup = fixture({ mainFiles: [file(OLDER_FILE)] });
  let peer = { number: 400, head: 'old-head', files: [file(OTHER_FILE)], changed_files: 3001 };
  const result = await checkPullRequestMigrations({ ...setup.options, request: async (path) => {
    if (path.endsWith('/git/trees/migrations-tree')) peer = { ...peer, head: 'new-head', newPeer: 401 };
    return setup.request(path);
  } });
  assert.equal(peer.head, 'new-head');
  assert.deepEqual(formatPullRequestMigrationProblems(result), []);
  assert.ok(!setup.calls.some((path) => path.includes('/pulls?') || /\/pulls\/(?!345(?:\/|$))/.test(path)));
});

test('ファイル一覧の不足・API途中失敗を無視しない', async () => {
  await assert.rejects(checkPullRequestMigrations(fixture({ currentCount: 2 }).options), /全件取得できません/);
  const setup = fixture();
  await assert.rejects(checkPullRequestMigrations({ ...setup.options, request: async (path) => {
    if (path.includes('/pulls/345/files')) throw new Error('GitHub APIの取得に失敗しました');
    return setup.request(path);
  } }), /GitHub APIの取得に失敗/);
});

test('mainのtree省略・壊れたblob情報・不正なSQL名を無視しない', async () => {
  const setup = fixture();
  for (const response of [
    { tree: [], truncated: true },
    { tree: [{ path: `${VERSION}_broken_change.sql`, type: 'blob' }], truncated: false },
    { tree: [{ path: 'broken.sql', type: 'blob', sha: 'blob' }], truncated: false },
  ]) {
    await assert.rejects(checkPullRequestMigrations({ ...setup.options,
      request: async (path) => path.endsWith('/git/trees/migrations-tree') ? response : setup.request(path),
    }), /省略|不正/);
  }
});

test('古いheadのイベントは最新PRの差分と取り違えず失敗する', async () => {
  const setup = fixture();
  setup.event.pull_request.head.sha = 'obsolete-head';
  await assert.rejects(checkPullRequestMigrations(setup.options), /イベント発生時から変化/);
});

test('照合中にmainが進めば取り込み済みSQLだけのPRでも再実行を要求する', async () => {
  for (const mainFiles of [[], [file()]]) {
    const setup = fixture({ mainFiles });
    let refCalls = 0;
    await assert.rejects(checkPullRequestMigrations({ ...setup.options, request: async (path) => {
      if (path.endsWith('/git/ref/heads/main') && ++refCalls === 2) return { object: { sha: 'new-main-head' } };
      return setup.request(path);
    } }), /対象ブランチが検証中に更新/);
  }
});

test('照合中に現在のPRのhead・対象ブランチが変わった場合は成功にしない', async () => {
  for (const update of [{ head: { sha: 'new-head' } }, { base: { ref: 'other' } }]) {
    const setup = fixture();
    let pullCalls = 0;
    await assert.rejects(checkPullRequestMigrations({ ...setup.options, request: async (path) => {
      if (path === `${PREFIX}/pulls/345` && ++pullCalls === 2) return { ...setup.current, ...update };
      return setup.request(path);
    } }), /検証中に現在のPRが変化/);
  }
});

test('GitHub APIはGETだけを使い、失敗時にトークンを出力しない', async () => {
  let received;
  const request = createGitHubRequest('test-secret-token', async (url, options) => {
    received = { url, options };
    return { ok: false, status: 403 };
  });
  await assert.rejects(request(`${PREFIX}/pulls/345`), (error) => error.message.includes('HTTP 403') && !error.message.includes('test-secret-token'));
  assert.equal(received.options.method, 'GET');
  assert.equal(received.url, `https://api.github.com${PREFIX}/pulls/345`);
});

test('CIはPR編集で起動せず、push時の4ジョブを編集用条件でスキップしない', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  // 設定の対象部分をテキストで検査し、YAMLパッケージの間接依存を使わない。
  const pullRequest = workflow.match(/^  pull_request:\r?\n([\s\S]*?)(?=^  \w+:|^\S)/m)?.[1];
  assert.ok(pullRequest, 'pull_requestトリガーが必要です');
  assert.match(pullRequest, /^    branches: \[main\]\r?$/m);
  const types = pullRequest.match(/^    types: \[([^\]]+)\]\r?$/m)?.[1].split(',').map((type) => type.trim());
  assert.deepEqual(types, ['opened', 'synchronize', 'reopened', 'ready_for_review']);
  assert.doesNotMatch(workflow, /^ {4}if:/m, 'ジョブ単位の編集用スキップ条件を置かない');
  for (const name of ['Migration Check', 'Type Check', 'Test', 'DB Migration']) {
    assert.ok(workflow.includes(`    name: ${name}\n`) || workflow.includes(`    name: ${name}\r\n`));
  }
  assert.match(workflow, /^  group: ci-\$\{\{ github\.ref \}\}\r?$/m);
  assert.match(workflow, /^  cancel-in-progress: true\r?$/m);
  // PR情報がないmerge_groupでは、最新main照合のステップだけを実行しない。
  assert.match(workflow, /^        if: github\.event_name == 'pull_request'\r?$/m);
});
