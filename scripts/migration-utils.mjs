import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);
export const MIGRATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** 実在するUTC日時だけを14桁のマイグレーション番号にする。 */
export function formatUtcTimestamp(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("マイグレーションの作成日時が不正です。");
  }
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) {
    throw new Error("マイグレーションの作成日時は西暦0001〜9999年にしてください。");
  }
  return date.toISOString().slice(0, 19).replace(/[-T:]/g, "");
}

/** 14桁の番号をUTC日時として読み、存在しない月日や時刻を拒否する。 */
export function parseUtcTimestamp(version) {
  if (!/^\d{14}$/.test(version)) return null;
  const iso = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}`
    + `T${version.slice(8, 10)}:${version.slice(10, 12)}:${version.slice(12, 14)}Z`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1) return null;
  return formatUtcTimestamp(date) === version ? date : null;
}

/** ファイル名の形式・UTC日時・説明名を確認する。 */
export function parseMigrationFilename(filename) {
  const match = /^(\d{14})_([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/.exec(filename);
  if (!match || !parseUtcTimestamp(match[1])) return null;
  return { version: match[1], name: match[2], filename };
}

/** SQLファイル名を読む。大文字の拡張子も検査対象に含める。 */
export async function readMigrationFiles(directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** ファイル名一覧から、不正な形式と同じ番号の全ファイルを取り出す。 */
export function inspectMigrationFiles(filenames) {
  const migrations = [];
  const invalidFiles = [];
  const byVersion = new Map();
  for (const filename of [...filenames].sort()) {
    const migration = parseMigrationFilename(filename);
    if (migration) migrations.push(migration);
    else invalidFiles.push(filename);
    // 説明名が不正なファイルにも番号重複があれば、両方の問題を報告する。
    const version = /^(\d{14})_.*\.sql$/i.exec(filename)?.[1];
    if (version) {
      const files = byVersion.get(version) ?? [];
      files.push(filename);
      byVersion.set(version, files);
    }
  }
  const duplicates = [...byVersion]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }));
  return { migrations, invalidFiles, duplicates };
}

/** ローカルとCIで同じ番号・ファイル名を含む診断を使う。 */
export function formatMigrationProblems({ invalidFiles, duplicates }) {
  const problems = [];
  if (invalidFiles.length) {
    problems.push(
      "マイグレーションのファイル名が不正です。実在するUTC日時とsnake_caseの説明名を使ってください（YYYYMMDDHHmmss_name.sql）:\n"
        + invalidFiles.map((filename) => `  ${filename}`).join("\n"),
    );
  }
  for (const { version, files } of duplicates) {
    problems.push(
      `マイグレーション番号が重複しています: ${version}\n`
        + files.map((filename) => `  ${filename}`).join("\n"),
    );
  }
  return problems;
}
