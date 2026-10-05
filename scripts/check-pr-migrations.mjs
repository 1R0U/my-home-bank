import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMigrationFilename } from './migration-utils.mjs';

const MIGRATION_DIRECTORY = 'supabase/migrations/';
const PAGE_SIZE = 100;
const MAX_DIFF_FILES = 3000;
const NEW_FILE_STATUSES = new Set(['added', 'renamed', 'copied']);
const FILE_STATUSES = new Set([...NEW_FILE_STATUSES, 'removed', 'modified', 'changed', 'unchanged']);

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

/** 同じ対象ブランチの開いているPRを、ページ末尾まで取得する。 */
async function listOpenPullRequests(request, repositoryPath, baseRef) {
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const data = await request(`${repositoryPath}/pulls?state=open&base=${encodeURIComponent(baseRef)}&per_page=${PAGE_SIZE}&page=${page}`);
    requireValue(Array.isArray(data), '開いているPR一覧のAPI応答が不正です。');
    for (const pull of data) {
      requireValue(Number.isSafeInteger(pull.number) && pull.head?.sha && pull.base?.ref === baseRef,
        '開いているPR一覧に番号・head・対象ブランチが欠けています。');
      requireValue(!pulls.some((previous) => previous.number === pull.number),
        '検証中にPR一覧が変化しました。CIを再実行してください。');
      pulls.push(pull);
    }
    if (data.length < PAGE_SIZE) return pulls;
  }
}

/** 差分を全件取得できた場合だけ、追加・改名されたSQLを照合対象にする。 */
async function readNewMigrations(request, repositoryPath, pull) {
  requireValue(Number.isSafeInteger(pull.changed_files) && pull.changed_files >= 0,
    `PR #${pull.number}の変更ファイル数を取得できませんでした。`);
  requireValue(pull.changed_files <= MAX_DIFF_FILES,
    `PR #${pull.number}は変更ファイルが${MAX_DIFF_FILES}件を超えているため、GitHub APIで全件を検証できません。`);
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

/** 最新コミットを固定し、対象ブランチのSQLを階層ごとに読む。 */
async function readBaseMigrations(request, repositoryPath, baseRef) {
  const refPath = `${repositoryPath}/git/ref/heads/${encodeURIComponent(baseRef)}`;
  const ref = await request(refPath);
  requireValue(typeof ref.object?.sha === 'string', '対象ブランチの最新コミットを取得できませんでした。');
  const baseSha = ref.object.sha;
  let treeSha = baseSha;
  // 巨大なリポジトリでも全体のrecursive treeの上限に依存しないよう、階層を順に読む。
  for (const directory of ['supabase', 'migrations']) {
    const tree = await request(`${repositoryPath}/git/trees/${treeSha}`);
    requireValue(Array.isArray(tree.tree) && tree.truncated === false,
      '対象ブランチのファイル一覧が省略されているため、番号の重複を検証できません。');
    const entry = tree.tree.find((item) => item.path === directory);
    if (!entry) return { baseSha, refPath, migrations: [] };
    requireValue(entry.type === 'tree' && entry.sha, `対象ブランチの${directory}ディレクトリを取得できませんでした。`);
    treeSha = entry.sha;
  }
  const tree = await request(`${repositoryPath}/git/trees/${treeSha}`);
  requireValue(Array.isArray(tree.tree) && tree.truncated === false,
    '対象ブランチのマイグレーション一覧が省略されているため、番号の重複を検証できません。');
  const migrations = tree.tree.filter((entry) => entry.type === 'blob')
    .map((entry) => migrationFromPath(`${MIGRATION_DIRECTORY}${entry.path}`, entry.sha)).filter(Boolean);
  return { baseSha, refPath, migrations };
}

/** 同じパスと内容の取り込み済みSQLは、新しい番号衝突として扱わない。 */
function sameMigration(left, right) {
  return left.path === right.path && left.sha === right.sha;
}

/** PR一覧の順序に依存せず、検証中の追加・削除・head更新を見つける。 */
function pullSnapshot(pulls) {
  return JSON.stringify(pulls.map((pull) => [pull.number, pull.head.sha]).sort((left, right) => left[0] - right[0]));
}

/** 現在のPRの新規番号を、最新の対象ブランチと並行PRの新規番号に照合する。 */
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
  const result = { number, baseRef, baseSha: null, migrationCount: additions.length, checkedPullRequests: [], conflicts: [] };
  if (additions.length === 0) return result;

  const base = await readBaseMigrations(request, repositoryPath, baseRef);
  result.baseSha = base.baseSha;
  // 古いmerge-baseの差分に残っている、既にmainへ入った同じSQLは新規採番ではない。
  const introductions = additions.filter((addition) => !base.migrations.some((existing) => sameMigration(addition, existing)));
  result.migrationCount = introductions.length;
  if (introductions.length === 0) {
    const finalRef = await request(base.refPath);
    requireValue(finalRef.object?.sha === base.baseSha,
      '対象ブランチが検証中に更新されました。CIを再実行してください。');
    return result;
  }
  const openPulls = await listOpenPullRequests(request, repositoryPath, baseRef);
  requireValue(openPulls.some((pull) => pull.number === number && pull.head.sha === expectedSha),
    '検証中に現在のPRが変化しました。CIを再実行してください。');

  for (const addition of introductions) {
    for (const existing of base.migrations) {
      if (addition.version === existing.version && !sameMigration(addition, existing)) {
        result.conflicts.push({ version: addition.version, file: addition.path, otherFile: existing.path, source: baseRef });
      }
    }
  }
  for (const summary of openPulls.filter((pull) => pull.number !== number)) {
    const other = await request(`${repositoryPath}/pulls/${summary.number}`);
    requireValue(other.number === summary.number && other.state === 'open' && other.head?.sha === summary.head.sha && other.base?.ref === baseRef,
      `PR #${summary.number}が検証中に変化しました。CIを再実行してください。`);
    const otherAdditions = await readNewMigrations(request, repositoryPath, other);
    result.checkedPullRequests.push(other.number);
    for (const addition of introductions) {
      for (const existing of otherAdditions) {
        if (addition.version === existing.version && !sameMigration(addition, existing)) {
          result.conflicts.push({ version: addition.version, file: addition.path, otherFile: existing.path, source: `PR #${other.number}`, pullRequestNumber: other.number });
        }
      }
    }
  }

  const finalRef = await request(base.refPath);
  requireValue(finalRef.object?.sha === base.baseSha,
    '対象ブランチが検証中に更新されました。CIを再実行してください。');
  const finalPulls = await listOpenPullRequests(request, repositoryPath, baseRef);
  requireValue(pullSnapshot(finalPulls) === pullSnapshot(openPulls),
    '並行PRが検証中に更新されました。CIを再実行してください。');
  return result;
}

/** 番号と双方のファイル名・PR番号を、ローカルとCIで読める診断にする。 */
export function formatPullRequestMigrationProblems(result) {
  return result.conflicts.map((conflict) =>
    `番号 ${conflict.version} が重複しています: ${conflict.file} ↔ ${conflict.source} の ${conflict.otherFile}`);
}

/** Actionsのイベントから読み取り専用照合を実行し、衝突時は非ゼロ終了する。 */
async function main() {
  requireValue(process.env.GITHUB_TOKEN, '読み取り権限のGITHUB_TOKENが必要です。');
  requireValue(process.env.GITHUB_EVENT_PATH, 'GITHUB_EVENT_PATHが必要です。');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await checkPullRequestMigrations({ event, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
  const problems = formatPullRequestMigrationProblems(result);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error('未適用の新規マイグレーションを共通作成コマンドで採番し直してください。適用済みファイルは変更しないでください。');
    process.exitCode = 1;
  } else {
    console.log(`PR #${result.number}: 新規マイグレーション${result.migrationCount}件に番号の衝突はありません（並行PR ${result.checkedPullRequests.length}件確認）。`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`マイグレーションの並行PR検証に失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
