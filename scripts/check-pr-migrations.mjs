import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMigrationFilename } from './migration-utils.mjs';

const MIGRATION_DIRECTORY = 'supabase/migrations/';
const PAGE_SIZE = 100;
const MAX_DIFF_FILES = 3000;
const NEW_FILE_STATUSES = new Set(['added', 'renamed', 'copied']);
const FILE_STATUSES = new Set([...NEW_FILE_STATUSES, 'removed', 'modified', 'changed', 'unchanged']);

/**
 * Issue #383: SQL Editorで2本の適用成功・旧色の補完漏れ0件を確認後、別PRでmainの番号が進んだ。
 * 2026-10-08に利用者が承認した今回限定の例外。適用済みSQLは改名・変更しない。
 * リポジトリ・PR・対象ブランチ・完全なパス・Git blob SHAが一致する2本だけ、順序違反を除外する。
 * 番号の重複検査、最新main/headの再照合、稼働DBのmigration履歴は変更しない。
 * 根拠: https://github.com/1R0U/my-home-bank/issues/383
 */
const APPLIED_MIGRATION_EXCEPTION = {
  repository: '1R0U/my-home-bank',
  number: 382,
  baseRef: 'main',
  issue: 383,
  migrations: [
    {
      path: 'supabase/migrations/20261008094946_create_character_palettes.sql',
      sha: '4e1b2e847b4573aa84e3fe6c05d79c139699e818',
    },
    {
      path: 'supabase/migrations/20261008094954_backfill_frog_character_palettes.sql',
      sha: '5d4cd4d4fbaaa566f0f7f78c007fc588037fc46b',
    },
  ],
};

/** 必須のAPI情報が欠けていたら、照合を成功扱いせず止める。 */
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

/** migrations直下の正しいSQL名だけを、内容識別子とともに取り出す。 */
function migrationFromPath(path, sha) {
  if (!path.startsWith(MIGRATION_DIRECTORY) || path.slice(MIGRATION_DIRECTORY.length).includes('/')) return null;
  const migration = parseMigrationFilename(basename(path));
  return migration ? { ...migration, path, sha } : null;
}

/** 読み取り専用のGitHub APIを呼び、取得失敗を検証成功として扱わない。 */
export function createGitHubRequest(token, fetchImplementation = fetch) {
  return async (path) => {
    const response = await fetchImplementation(`https://api.github.com${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'my-home-bank-migration-check',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub APIの取得に失敗しました（HTTP ${response.status}、${path}）。`);
    return response.json();
  };
}

/** 現在のPRの差分だけを全件取得し、APIの上限超過・取得不足を拒否する。 */
async function readNewMigrations(request, repositoryPath, pull) {
  requireValue(Number.isSafeInteger(pull.changed_files) && pull.changed_files >= 0,
    `PR #${pull.number}の変更ファイル数を取得できませんでした。`);
  requireValue(pull.changed_files <= MAX_DIFF_FILES,
    `PR #${pull.number}の変更ファイル数がGitHub APIの上限（${MAX_DIFF_FILES}件）を超えています。全件照合できる大きさにPRを分割してください。`);
  const migrations = [];
  const seen = new Set();
  for (let page = 1; seen.size < pull.changed_files; page += 1) {
    const files = await request(`${repositoryPath}/pulls/${pull.number}/files?per_page=${PAGE_SIZE}&page=${page}`);
    requireValue(Array.isArray(files) && files.length > 0,
      `PR #${pull.number}の変更ファイルを全件取得できませんでした。CIを再実行してください。`);
    for (const file of files) {
      requireValue(typeof file.filename === 'string' && FILE_STATUSES.has(file.status),
        `PR #${pull.number}の変更ファイル情報が不正です。`);
      requireValue(!seen.has(file.filename), `PR #${pull.number}の差分が検証中に変化しました。CIを再実行してください。`);
      seen.add(file.filename);
      if (!NEW_FILE_STATUSES.has(file.status)) continue;
      const migration = migrationFromPath(file.filename, file.sha);
      if (!migration) continue;
      requireValue(typeof file.sha === 'string' && file.sha.length > 0,
        `PR #${pull.number}の${file.filename}の内容識別子を取得できませんでした。`);
      migrations.push(migration);
    }
    requireValue(seen.size <= pull.changed_files,
      `PR #${pull.number}の差分が検証中に変化しました。CIを再実行してください。`);
    requireValue(files.length === PAGE_SIZE || seen.size === pull.changed_files,
      `PR #${pull.number}の変更ファイルを全件取得できませんでした。CIを再実行してください。`);
  }
  return migrations;
}

/** 固定したコミットのSQLを階層ごとに読み、不完全なtree応答を拒否する。 */
async function readMigrationTree(request, repositoryPath, commitSha, label) {
  let treeSha = commitSha;
  const readTree = async (sha) => {
    const tree = await request(`${repositoryPath}/git/trees/${encodeURIComponent(sha)}`);
    requireValue(Array.isArray(tree.tree) && tree.truncated === false,
      `${label}のファイル一覧が省略されているため、番号の重複を検証できません。`);
    requireValue(tree.tree.every((entry) => typeof entry.path === 'string' && entry.path.length > 0 && !entry.path.includes('/')
      && ['tree', 'blob', 'commit'].includes(entry.type) && typeof entry.sha === 'string' && entry.sha.length > 0),
    `${label}のファイル一覧が不正なため、番号の重複を検証できません。`);
    requireValue(new Set(tree.tree.map((entry) => entry.path)).size === tree.tree.length,
      `${label}のファイル一覧に同じパスが重複しています。`);
    return tree.tree;
  };
  // 巨大なリポジトリでも全体のrecursive treeの上限に依存しないよう、階層を順に読む。
  for (const directory of ['supabase', 'migrations']) {
    const tree = await readTree(treeSha);
    const entry = tree.find((item) => item.path === directory);
    if (!entry) return [];
    requireValue(entry.type === 'tree', `${label}の${directory}ディレクトリを取得できませんでした。`);
    treeSha = entry.sha;
  }
  const tree = await readTree(treeSha);
  const migrations = [];
  for (const entry of tree) {
    if (!entry.path.endsWith('.sql')) continue;
    const migration = migrationFromPath(`${MIGRATION_DIRECTORY}${entry.path}`, entry.sha);
    requireValue(entry.type === 'blob' && migration,
      `${label}のマイグレーションファイル名または種類が不正です: ${entry.path}`);
    migrations.push(migration);
  }
  return migrations;
}

/** 最新コミットを固定し、対象ブランチのSQLを階層ごとに読む。 */
async function readBaseMigrations(request, repositoryPath, baseRef) {
  const refPath = `${repositoryPath}/git/ref/heads/${encodeURIComponent(baseRef)}`;
  const ref = await request(refPath);
  requireValue(typeof ref.object?.sha === 'string' && ref.object.sha, '対象ブランチの最新コミットを取得できませんでした。');
  const baseSha = ref.object.sha;
  const migrations = await readMigrationTree(request, repositoryPath, baseSha, '対象ブランチ');
  return { baseSha, refPath, migrations };
}

/** 同じパスと内容の取り込み済みSQLは、新しい番号衝突として扱わない。 */
function sameMigration(left, right) {
  return left.path === right.path && left.sha === right.sha;
}

/** 現在のPRの新規番号を、最新の対象ブランチの番号と適用順に照合する。 */
export async function checkPullRequestMigrations({ event, repository, token, request = createGitHubRequest(token) }) {
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''), 'GITHUB_REPOSITORYが設定されていません。');
  const number = event?.number ?? event?.pull_request?.number;
  const expectedSha = event?.pull_request?.head?.sha;
  const baseRef = event?.pull_request?.base?.ref;
  requireValue(Number.isSafeInteger(number) && number > 0 && typeof expectedSha === 'string' && typeof baseRef === 'string' && baseRef,
    'pull_requestイベントの番号・head・対象ブランチが必要です。');
  const repositoryPath = `/repos/${repository}`;
  const current = await request(`${repositoryPath}/pulls/${number}`);
  requireValue(current.number === number && current.state === 'open' && current.head?.sha === expectedSha && current.base?.ref === baseRef,
    '現在のPRがイベント発生時から変化しました。最新コミットのCIを確認してください。');
  const additions = await readNewMigrations(request, repositoryPath, current);
  const result = { number, baseRef, baseSha: null, migrationCount: additions.length, conflicts: [], outOfOrder: [], appliedExceptions: [] };
  if (additions.length === 0) return result;

  const base = await readBaseMigrations(request, repositoryPath, baseRef);
  result.baseSha = base.baseSha;
  // 古いmerge-baseの差分に残っている、既にmainへ入った同じSQLは新規採番ではない。
  const introductions = additions.filter((addition) => !base.migrations.some((existing) => sameMigration(addition, existing)));
  result.migrationCount = introductions.length;
  const latestVersion = base.migrations.reduce((latest, migration) =>
    latest === null || migration.version > latest ? migration.version : latest, null);
  for (const addition of introductions) {
    if (latestVersion !== null && addition.version <= latestVersion) {
      const isConfirmedApplied = repository === APPLIED_MIGRATION_EXCEPTION.repository
        && number === APPLIED_MIGRATION_EXCEPTION.number && baseRef === APPLIED_MIGRATION_EXCEPTION.baseRef
        && APPLIED_MIGRATION_EXCEPTION.migrations.some((confirmed) => sameMigration(addition, confirmed));
      if (isConfirmedApplied) {
        result.appliedExceptions.push({ version: addition.version, file: addition.path, issue: APPLIED_MIGRATION_EXCEPTION.issue });
      } else {
        result.outOfOrder.push({ version: addition.version, file: addition.path, latestVersion });
      }
    }
    for (const existing of base.migrations) {
      if (addition.version === existing.version && !sameMigration(addition, existing)) {
        result.conflicts.push({ version: addition.version, file: addition.path, otherFile: existing.path, source: baseRef });
      }
    }
  }

  const finalRef = await request(base.refPath);
  requireValue(finalRef.object?.sha === base.baseSha,
    '対象ブランチが検証中に更新されました。CIを再実行してください。');
  const finalCurrent = await request(`${repositoryPath}/pulls/${number}`);
  requireValue(finalCurrent.number === number && finalCurrent.state === 'open'
    && finalCurrent.head?.sha === expectedSha && finalCurrent.base?.ref === baseRef,
    '検証中に現在のPRが変化しました。最新コミットのCIを確認してください。');
  return result;
}

/** 重複・適用順の違反を、該当ファイルと最新番号を含む診断にする。 */
export function formatPullRequestMigrationProblems(result) {
  return [
    ...result.conflicts.map((conflict) =>
      `番号 ${conflict.version} が重複しています: ${conflict.file} ↔ ${conflict.source} の ${conflict.otherFile}`),
    ...result.outOfOrder.map((migration) =>
      `${migration.file} の番号 ${migration.version} は ${result.baseRef} の最新番号 ${migration.latestVersion} 以下です。未適用と確認した上で npm run migration:new -- 説明のsnake_case で作り直してください。`),
  ];
}

/** Actionsのイベントから読み取り専用照合を実行し、違反時は非ゼロ終了する。 */
async function main() {
  requireValue(process.env.GITHUB_TOKEN, '読み取り権限のGITHUB_TOKENが必要です。');
  requireValue(process.env.GITHUB_EVENT_PATH, 'GITHUB_EVENT_PATHが必要です。');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await checkPullRequestMigrations({ event, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
  const problems = formatPullRequestMigrationProblems(result);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error('未適用の新規マイグレーションを npm run migration:new で採番し直してください。適用済みファイルは変更しないでください。');
    process.exitCode = 1;
  } else {
    const comparison = result.baseSha ? `最新${result.baseRef}と照合` : '追加SQLなしのため照合不要';
    const exceptionNote = result.appliedExceptions.length > 0
      ? `、Issue #383の適用済みSQL ${result.appliedExceptions.length}件に今回限定の順序例外を適用` : '';
    console.log(`PR #${result.number}: 新規マイグレーション${result.migrationCount}件に番号の重複・適用順の違反はありません（${comparison}${exceptionNote}）。`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`マイグレーションの最新main照合に失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
