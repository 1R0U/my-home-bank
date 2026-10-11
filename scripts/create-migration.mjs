import { mkdir, rmdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  MIGRATION_NAME_PATTERN,
  formatMigrationProblems,
  formatUtcTimestamp,
  inspectMigrationFiles,
  parseUtcTimestamp,
  readMigrationFiles,
} from "./migration-utils.mjs";

/** 番号の翌秒を求める。日・月・年の境界もUTC日時として繰り上げる。 */
function nextVersion(version) {
  return formatUtcTimestamp(new Date(parseUtcTimestamp(version).getTime() + 1000));
}

/** 不正な番号が既にある状態で新しいファイルを作らない。 */
async function inspectDirectory(directory) {
  const result = inspectMigrationFiles(await readMigrationFiles(directory));
  const problems = formatMigrationProblems(result);
  if (problems.length) throw new Error(problems.join("\n"));
  return result;
}

/** UTCの現在時刻を起点に、既存ファイル・同時作成と衝突しない番号を予約して作る。 */
export async function createMigration(name, {
  directory = DEFAULT_MIGRATIONS_DIRECTORY,
  now = new Date(),
} = {}) {
  if (typeof name !== "string" || !MIGRATION_NAME_PATTERN.test(name)) {
    throw new Error("説明名は英小文字で始まるsnake_caseにしてください（例: add_user_nickname）。");
  }
  const migrationDirectory = resolve(directory);
  const currentVersion = formatUtcTimestamp(now);
  const existing = await inspectDirectory(migrationDirectory);
  const latestVersion = existing.migrations.at(-1)?.version;
  let version = latestVersion && latestVersion >= currentVersion
    ? nextVersion(latestVersion)
    : currentVersion;

  while (true) {
    // ファイル名だけのwxでは、同じ番号・異なる説明名の競合を防げない。
    // 番号専用の空ディレクトリをmkdirで原子的に予約する。
    const reservationDirectory = join(migrationDirectory, `.migration-${version}.lock`);
    try {
      await mkdir(reservationDirectory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // 異常終了で予約が残っても待ち続けず、その番号だけを避ける。
      version = nextVersion(version);
      continue;
    }

    try {
      // 予約取得前に別プロセスが作成・予約解除した場合も、最新状態で採番し直す。
      const fresh = await inspectDirectory(migrationDirectory);
      const freshLatest = fresh.migrations.at(-1)?.version;
      if (freshLatest && freshLatest >= version) {
        version = nextVersion(freshLatest);
        continue;
      }
      const filename = `${version}_${name}.sql`;
      const filePath = join(migrationDirectory, filename);
      await writeFile(filePath, "-- このマイグレーションで行う変更を記述してください。\n", {
        encoding: "utf8",
        flag: "wx",
      });
      return { version, filename, filePath };
    } finally {
      // 成功・失敗のどちらも、自分が取得した空の予約だけを解除する。
      await rmdir(reservationDirectory);
    }
  }
}

/** CLI引数を読む。日時番号の手指定は受け付けない。 */
function parseArguments(args) {
  let name;
  let directory = DEFAULT_MIGRATIONS_DIRECTORY;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--directory") {
      directory = args[++index];
      if (!directory || directory.startsWith("--")) throw new Error("--directoryにはディレクトリを指定してください。");
    } else if (!argument.startsWith("--") && !name) {
      name = argument;
    } else {
      throw new Error(`不明な引数です: ${argument}`);
    }
  }
  if (!name) throw new Error("説明名を指定してください。例: npm run migration:new -- add_user_nickname");
  return { name, directory };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log("使い方: npm run migration:new -- <snake_caseの説明名> [--directory <ディレクトリ>]");
    } else {
      const { name, directory } = parseArguments(process.argv.slice(2));
      const result = await createMigration(name, { directory });
      console.log(`マイグレーションを作成しました: ${result.filePath}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
