import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPullRequestMigrations,
  createGitHubRequest,
  formatPullRequestMigrationProblems,
} from '../scripts/check-pr-migrations.mjs';

const VERSION = '20261005123000';
const CURRENT_FILE = `supabase/migrations/${VERSION}_current_change.sql`;
const OTHER_FILE = `supabase/migrations/${VERSION}_other_change.sql`;
const PREFIX = '/repos/example/bank';

function file(filename = CURRENT_FILE, status = 'added', sha = 'blob-current') {
  return { filename, status, sha };
}

function fixture({ currentFiles = [file()], currentBaseFiles = [], currentHeadFiles, peers = [], mainFiles = [], currentCount } = {}) {
  const event = { number: 345, pull_request: { head: { sha: 'head-current' }, base: { ref: 'main' } } };
  const current = { number: 345, state: 'open', head: { sha: 'head-current' }, base: { ref: 'main', sha: 'base-head' }, changed_files: currentCount ?? currentFiles.length };
  const pulls = [current, ...peers.map((peer, index) => ({
    number: peer.number ?? 400 + index,
    state: 'open',
    head: { sha: peer.headSha ?? `head-${index}` },
    base: { ref: 'main', sha: 'base-head' },
    changed_files: peer.changedFiles ?? peer.files.length,
  }))];
  const filesByNumber = new Map([[345, currentFiles], ...peers.map((peer, index) => [pulls[index + 1].number, peer.files])]);
  const snapshots = new Map();
  const addSnapshot = (sha, files) => {
    snapshots.set(sha, { tree: [{ path: 'supabase', type: 'tree', sha: `${sha}-supabase` }], truncated: false });
    snapshots.set(`${sha}-supabase`, { tree: [{ path: 'migrations', type: 'tree', sha: `${sha}-migrations` }], truncated: false });
    snapshots.set(`${sha}-migrations`, {
      tree: files.filter((entry) => entry.status !== 'removed' && entry.filename.startsWith('supabase/migrations/'))
        .map((entry) => ({ path: entry.filename.slice('supabase/migrations/'.length), type: 'blob', sha: entry.sha })),
      truncated: false,
    });
  };
  addSnapshot('head-current', currentHeadFiles ?? currentFiles);
  addSnapshot('merge-base-head-current', currentBaseFiles);
  peers.forEach((peer, index) => {
    const headSha = pulls[index + 1].head.sha;
    addSnapshot(headSha, peer.headFiles ?? peer.files);
    addSnapshot(`merge-base-${headSha}`, peer.baseFiles ?? []);
  });
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path === `${PREFIX}/git/ref/heads/main`) return { object: { sha: 'base-head' } };
    if (path === `${PREFIX}/git/trees/base-head`) return { tree: [{ path: 'supabase', type: 'tree', sha: 'supabase-tree' }], truncated: false };
    if (path === `${PREFIX}/git/trees/supabase-tree`) return { tree: [{ path: 'migrations', type: 'tree', sha: 'migrations-tree' }], truncated: false };
    if (path === `${PREFIX}/git/trees/migrations-tree`) return {
      tree: mainFiles.map((entry) => ({ path: entry.filename.slice('supabase/migrations/'.length), type: 'blob', sha: entry.sha })),
      truncated: false,
    };
    const parsed = new URL(`https://api.github.com${path}`);
    const compare = parsed.pathname.match(/\/compare\/base-head\.\.\.(.+)$/);
    if (compare) return { merge_base_commit: { sha: `merge-base-${compare[1]}` } };
    const tree = parsed.pathname.match(/\/git\/trees\/(.+)$/);
    if (tree && snapshots.has(tree[1])) return snapshots.get(tree[1]);
    if (parsed.pathname === `${PREFIX}/pulls`) {
      const page = Number(parsed.searchParams.get('page'));
      return pulls.slice((page - 1) * 100, page * 100);
    }
    const match = parsed.pathname.match(/\/pulls\/(\d+)(\/files)?$/);
    if (match) {
      const number = Number(match[1]);
      if (!match[2]) return pulls.find((pull) => pull.number === number);
      const page = Number(parsed.searchParams.get('page'));
      return filesByNumber.get(number).slice((page - 1) * 100, page * 100);
    }
    throw new Error(`テストで想定しないAPI: ${path}`);
  };
  return { event, request, calls, pulls, options: { event, repository: 'example/bank', request } };
}

test('最新mainと並行PRの異なるファイルで同じ番号を検出し、番号と双方の名前を表示する', async () => {
  const setup = fixture({ mainFiles: [file(OTHER_FILE, 'added', 'blob-main')], peers: [{ number: 346, files: [file(OTHER_FILE, 'added', 'blob-peer')] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.deepEqual(result.conflicts.map(({ source }) => source), ['main', 'PR #346']);
  assert.equal(result.baseSha, 'base-head');
  const messages = formatPullRequestMigrationProblems(result);
  assert.ok(messages.every((message) => message.includes(VERSION) && message.includes(CURRENT_FILE) && message.includes(OTHER_FILE)));
});

test('別の番号で作られた並行PRは衝突しない', async () => {
  const setup = fixture({ peers: [{ files: [file('supabase/migrations/20261005123001_other_change.sql')] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.checkedPullRequests.length, 1);
});

test('並行PR同士の衝突は片方がマージされた後も、残ったPRと最新mainの衝突として止まる', async () => {
  const migrationA = file(OTHER_FILE, 'added', 'blob-pr-a');
  const beforeMerge = fixture({ peers: [{ number: 346, files: [migrationA] }] });
  const before = await checkPullRequestMigrations(beforeMerge.options);
  assert.equal(before.conflicts.length, 1);
  assert.equal(before.conflicts[0].source, 'PR #346');

  const afterMerge = fixture({ mainFiles: [migrationA] });
  const after = await checkPullRequestMigrations(afterMerge.options);
  assert.equal(after.conflicts.length, 1);
  assert.equal(after.conflicts[0].source, 'main');
  assert.equal(after.conflicts[0].version, VERSION);
  assert.ok(formatPullRequestMigrationProblems(after)[0].includes(OTHER_FILE));
});

test('古いベースに由来する同一パス・同一内容の継承は最新mainと並行PRでも衝突扱いしない', async () => {
  const setup = fixture({ mainFiles: [file()], peers: [{ files: [file()] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.migrationCount, 0);
});

test('既にmainへ入ったSQLだけのPRを、別の並行PRによる番号衝突に巻き込まない', async () => {
  const setup = fixture({ mainFiles: [file()], peers: [{ files: [file(OTHER_FILE)] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.checkedPullRequests, []);
});

test('同一ファイル名でもSQLのblobが異なる場合は番号の衝突として止める', async () => {
  const setup = fixture({ mainFiles: [file(CURRENT_FILE, 'added', 'different-main-blob')], peers: [{ files: [file(CURRENT_FILE, 'added', 'different-peer-blob')] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.conflicts.length, 2);
});

test('改名先の番号も検出するが削除・既存ファイルの変更・別ディレクトリは新規採番扱いしない', async () => {
  const setup = fixture({
    currentFiles: [
      { ...file(CURRENT_FILE, 'renamed'), previous_filename: 'supabase/migrations/20261005122959_old_change.sql' },
      file('docs/20261005123000_notes.sql'),
      file('supabase/migrations/20261005123000_deleted_change.sql', 'removed'),
      file('supabase/migrations/20261005123000_existing_change.sql', 'modified'),
    ],
    peers: [{ files: [file(OTHER_FILE)] }],
  });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 1);
  assert.equal(result.conflicts.length, 1);
});

test('追加のないPRは他PRの巨大差分やAPI取得に依存せず終了する', async () => {
  const setup = fixture({ currentFiles: [file(CURRENT_FILE, 'modified')], peers: [{ files: [], changedFiles: 3001 }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 0);
  assert.equal(setup.calls.length, 2);
  assert.ok(setup.calls.every((path) => path.includes('/pulls/345')));
});

test('開いているPR一覧と変更ファイル一覧の2ページ目以降も照合する', async () => {
  const peers = Array.from({ length: 100 }, (_, index) => ({ number: 400 + index, files: [] }));
  peers[99].files = [...Array.from({ length: 100 }, (_, index) => file(`docs/file-${index}.md`)), file(OTHER_FILE)];
  const setup = fixture({ peers });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.conflicts[0].pullRequestNumber, 499);
  assert.ok(setup.calls.some((path) => path.includes('/pulls?') && path.endsWith('page=2')));
  assert.ok(setup.calls.some((path) => path.includes('/pulls/499/files?') && path.endsWith('page=2')));
});

test('現在の巨大PRもmerge-baseとheadのSQL一覧から新規番号を取得する', async () => {
  const setup = fixture({ currentCount: 3001, peers: [{ files: [file(OTHER_FILE)] }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].source, 'PR #400');
  assert.ok(setup.calls.includes(`${PREFIX}/compare/base-head...head-current?per_page=1`));
  assert.ok(!setup.calls.some((path) => path.includes('/pulls/345/files')));
});

test('SQL追加のない巨大な並行PRが、無関係なマイグレーションPRを止めない', async () => {
  const setup = fixture({ peers: [{ number: 346, files: [], changedFiles: 3001 }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.checkedPullRequests, [346]);
  assert.ok(!setup.calls.some((path) => path.includes('/pulls/346/files')));
});

test('巨大な並行PRでもSQL追加の番号が衝突していれば検出する', async () => {
  const setup = fixture({ peers: [{ number: 346, files: [file(OTHER_FILE)], changedFiles: 3001 }] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].source, 'PR #346');
  assert.equal(result.conflicts[0].otherFile, OTHER_FILE);
});

test('巨大差分では既存SQLの内容変更・削除を追加扱いせず、改名先・コピー先を含める', async () => {
  const modified = file('supabase/migrations/20261005122955_existing_change.sql', 'modified', 'blob-modified');
  const deleted = file('supabase/migrations/20261005122956_deleted_change.sql', 'removed');
  const old = file('supabase/migrations/20261005122957_old_change.sql', 'removed');
  const copied = file('supabase/migrations/20261005123001_copied_change.sql', 'copied');
  const setup = fixture({
    currentCount: 3001,
    currentFiles: [modified, deleted, old, file(CURRENT_FILE, 'renamed'), copied],
    currentBaseFiles: [file(modified.filename, 'added', 'blob-original'), file(deleted.filename), file(old.filename)],
    peers: [{ files: [file(OTHER_FILE)] }],
  });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 2);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].file, CURRENT_FILE);
});

test('巨大差分は現在のmainではなく本来のmerge-baseにあったパスを既存扱いにする', async () => {
  const setup = fixture({ currentCount: 3001, currentBaseFiles: [file(CURRENT_FILE, 'added', 'old-blob')], currentFiles: [file(CURRENT_FILE, 'modified')] });
  const result = await checkPullRequestMigrations(setup.options);
  assert.equal(result.migrationCount, 0);
  assert.ok(!setup.calls.includes(`${PREFIX}/git/ref/heads/main`));
});

test('巨大差分のmerge-base欠落・compare API失敗を成功として扱わない', async () => {
  const setup = fixture({ currentCount: 3001 });
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => path.includes('/compare/') ? {} : setup.request(path),
  }), /merge-baseを取得できません/);
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => {
      if (path.includes('/compare/')) throw new Error('compare APIの取得に失敗しました');
      return setup.request(path);
    },
  }), /compare APIの取得に失敗/);
});

test('巨大差分のmigration subtreeの省略・壊れたblob情報・不正なSQL名を無視しない', async () => {
  const setup = fixture({ peers: [{ number: 346, files: [file(OTHER_FILE)], changedFiles: 3001 }] });
  const subtree = `${PREFIX}/git/trees/head-0-migrations`;
  for (const response of [
    { tree: [], truncated: true },
    { tree: [{ path: `${VERSION}_broken_change.sql`, type: 'blob' }], truncated: false },
    { tree: [{ path: 'broken.sql', type: 'blob', sha: 'blob' }], truncated: false },
  ]) {
    await assert.rejects(checkPullRequestMigrations({
      ...setup.options,
      request: async (path) => path === subtree ? response : setup.request(path),
    }), /省略|不正/);
  }
});

test('ファイル一覧の不足・API途中失敗を無視しない', async () => {
  const missing = fixture({ currentCount: 2 });
  await assert.rejects(checkPullRequestMigrations(missing.options), /全件取得できません/);
  const failing = fixture({ peers: [{ files: [file(OTHER_FILE)] }] });
  await assert.rejects(checkPullRequestMigrations({
    ...failing.options,
    request: async (path) => {
      if (path.includes('/pulls/400/files')) throw new Error('GitHub APIの取得に失敗しました');
      return failing.request(path);
    },
  }), /GitHub APIの取得に失敗/);
});

test('省略されたmainのtreeを全件照合できた扱いにしない', async () => {
  const setup = fixture();
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => path.endsWith('/git/trees/migrations-tree') ? { tree: [], truncated: true } : setup.request(path),
  }), /省略されている/);
});

test('古いheadのイベントは最新PRの差分と取り違えず失敗する', async () => {
  const setup = fixture();
  setup.event.pull_request.head.sha = 'obsolete-head';
  await assert.rejects(checkPullRequestMigrations(setup.options), /イベント発生時から変化/);
});

test('比較中にmainが進んだ場合は再実行を要求する', async () => {
  const setup = fixture();
  let refCalls = 0;
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => {
      if (path.endsWith('/git/ref/heads/main') && ++refCalls === 2) return { object: { sha: 'new-main-head' } };
      return setup.request(path);
    },
  }), /対象ブランチが検証中に更新/);
});

test('比較中に別PRのheadが変わった場合は古い結果で成功にしない', async () => {
  const setup = fixture({ peers: [{ files: [] }] });
  let listCalls = 0;
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => {
      const data = await setup.request(path);
      if (path.includes('/pulls?') && ++listCalls === 2) {
        return data.map((pull) => pull.number === 400 ? { ...pull, head: { sha: 'updated-peer-head' } } : pull);
      }
      return data;
    },
  }), /並行PRが検証中に更新/);
});

test('比較中に新しい並行PRが開かれた場合も再実行を要求する', async () => {
  const setup = fixture();
  let listCalls = 0;
  await assert.rejects(checkPullRequestMigrations({
    ...setup.options,
    request: async (path) => {
      const data = await setup.request(path);
      if (path.includes('/pulls?') && ++listCalls === 2) {
        return [...data, { number: 400, base: { ref: 'main' }, head: { sha: 'new-head' } }];
      }
      return data;
    },
  }), /並行PRが検証中に更新/);
});

test('GitHub APIはGETだけを使い、失敗時にトークンを出力しない', async () => {
  let received;
  const request = createGitHubRequest('test-secret-token', async (url, options) => {
    received = { url, options };
    return { ok: false, status: 403 };
  });
  await assert.rejects(request(`${PREFIX}/pulls`), (error) => error.message.includes('HTTP 403') && !error.message.includes('test-secret-token'));
  assert.equal(received.options.method, 'GET');
  assert.equal(received.url, `https://api.github.com${PREFIX}/pulls`);
});
