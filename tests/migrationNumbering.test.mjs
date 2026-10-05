import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkMigrations } from "../scripts/check-migrations.mjs";
import { createMigration } from "../scripts/create-migration.mjs";
import {
  formatMigrationProblems,
  formatUtcTimestamp,
  inspectMigrationFiles,
  parseMigrationFilename,
  parseUtcTimestamp,
} from "../scripts/migration-utils.mjs";

const creatorUrl = new URL("../scripts/create-migration.mjs", import.meta.url);
const checkerPath = fileURLToPath(new URL("../scripts/check-migrations.mjs", import.meta.url));
const now = new Date("2026-10-05T14:23:45.678Z");

/** テスト専用の空ディレクトリを作り、このテストが作ったものだけを片付ける。 */
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "home-bank-migration-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** シェルを介さず、別のNodeプロセスを実行する。 */
function nodeProcess(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { timeout: 15_000, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error);
        return;
      }
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

test("採番はローカル時刻ではなくUTCの年月日時分秒を使う", () => {
  assert.equal(formatUtcTimestamp(now), "20261005142345");
  assert.equal(formatUtcTimestamp(new Date("2026-10-05T23:23:45+09:00")), "20261005142345");
  assert.equal(formatUtcTimestamp(new Date("2026-01-01T00:00:00+09:00")), "20251231150000");
  assert.throws(() => formatUtcTimestamp(new Date("invalid")), /作成日時が不正/);
  assert.throws(() => formatUtcTimestamp(new Date("+010000-01-01T00:00:00Z")), /0001〜9999/);
});

test("ファイル名は14桁の実在するUTC日時とsnake_caseに限定する", () => {
  assert.deepEqual(parseMigrationFilename("20261005142345_add_user_nickname.sql"), {
    version: "20261005142345",
    name: "add_user_nickname",
    filename: "20261005142345_add_user_nickname.sql",
  });
  assert.ok(parseMigrationFilename("20240229000000_add_leap_day.sql"));
  for (const filename of [
    "20261005_add_column.sql",
    "202610051423450_add_column.sql",
    "20260229000000_add_column.sql",
    "20260230000000_add_column.sql",
    "20261301000000_add_column.sql",
    "20261005240000_add_column.sql",
    "20261005146000_add_column.sql",
    "20261005142360_add_column.sql",
    "00001005142345_add_column.sql",
    "20261005142345_AddColumn.sql",
    "20261005142345_add-column.sql",
    "20261005142345_add__column.sql",
    "20261005142345_add_column.SQL",
    "20261005142345_.sql",
    "../20261005142345_add_column.sql",
  ]) assert.equal(parseMigrationFilename(filename), null, filename);
  assert.equal(parseUtcTimestamp("20260230000000"), null);
});

test("重複診断には番号と該当するすべてのファイル名を表示する", () => {
  const result = inspectMigrationFiles([
    "20261005142345_add_wallet.sql",
    "20261005142346_add_profile.sql",
    "20261005142345_add-bank.sql",
    "20261005142345_add_bank.sql",
    "20260230000000_invalid_date.sql",
  ]);
  assert.equal(result.migrations.length, 3);
  assert.deepEqual(result.duplicates, [{
    version: "20261005142345",
    files: [
      "20261005142345_add-bank.sql",
      "20261005142345_add_bank.sql",
      "20261005142345_add_wallet.sql",
    ],
  }]);
  const diagnostic = formatMigrationProblems(result).join("\n");
  assert.match(diagnostic, /番号が重複しています: 20261005142345/);
  for (const filename of result.duplicates[0].files) assert.ok(diagnostic.includes(filename));
  assert.ok(diagnostic.includes("20260230000000_invalid_date.sql"));
});

test("同じ秒の繰り返し作成でも別番号にし、既存SQLを上書きしない", async (t) => {
  const directory = await fixture(t);
  const first = await createMigration("add_wallet", { directory, now });
  await writeFile(first.filePath, "select '既存内容';\n");
  const second = await createMigration("add_wallet", { directory, now });
  assert.equal(first.filename, "20261005142345_add_wallet.sql");
  assert.equal(second.filename, "20261005142346_add_wallet.sql");
  assert.equal(await readFile(first.filePath, "utf8"), "select '既存内容';\n");
  assert.ok((await readFile(second.filePath, "utf8")).startsWith("--"));
  assert.deepEqual((await readdir(directory)).sort(), [first.filename, second.filename]);
});

test("既存の最大番号より後に採番し、年境界も実在する日時に繰り上げる", async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, "20261231235959_existing.sql"), "select 1;\n");
  const result = await createMigration("next_year", { directory, now });
  assert.equal(result.filename, "20270101000000_next_year.sql");
});

test("異常終了で残った予約は待たずに避け、成功した予約だけを解除する", async (t) => {
  const directory = await fixture(t);
  const stale = ".migration-20261005142345.lock";
  await mkdir(join(directory, stale));
  const result = await createMigration("after_interruption", { directory, now });
  assert.equal(result.version, "20261005142346");
  assert.deepEqual((await readdir(directory)).sort(), [stale, result.filename]);
});

test("既存の重複・不正なファイル名を直すまでは新規作成しない", async (t) => {
  const directory = await fixture(t);
  const first = "20261005142345_first.sql";
  const second = "20261005142345_second.sql";
  await writeFile(join(directory, first), "select 1;\n");
  await writeFile(join(directory, second), "select 2;\n");
  await assert.rejects(createMigration("third", { directory, now }), /番号が重複/);
  assert.deepEqual((await readdir(directory)).sort(), [first, second]);

  const invalidDirectory = await fixture(t);
  await writeFile(join(invalidDirectory, "20260230000000_impossible_date.sql"), "select 1;\n");
  await assert.rejects(createMigration("valid_name", { directory: invalidDirectory, now }), /ファイル名が不正/);
});

test("説明名のパスや不正な値を拒否し、SQLファイルを作らない", async (t) => {
  const directory = await fixture(t);
  for (const name of ["../escaped", "AddName", "add-name", "add__name", "", undefined, null]) {
    await assert.rejects(createMigration(name, { directory, now }), /snake_case/);
  }
  assert.deepEqual(await readdir(directory), []);
});

test("別プロセスが同じ秒に異なる説明名で並行作成しても番号が重複しない", async (t) => {
  const directory = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => {
    const source = `import { createMigration } from ${JSON.stringify(creatorUrl.href)};
      const result = await createMigration(${JSON.stringify(`parallel_${index}`)}, {
        directory: ${JSON.stringify(directory)}, now: new Date(${JSON.stringify(now.toISOString())})
      });
      console.log(result.filename);`;
    return nodeProcess(["--input-type=module", "--eval", source]);
  }));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  const filenames = results.map(({ stdout }) => stdout.trim());
  assert.equal(new Set(filenames.map((filename) => parseMigrationFilename(filename).version)).size, 8);
  const inspection = await checkMigrations(directory);
  assert.deepEqual(inspection.invalidFiles, []);
  assert.deepEqual(inspection.duplicates, []);
  assert.equal(inspection.migrations.length, 8);
  assert.equal((await readdir(directory)).length, 8, "成功時に予約を残さない");
});

test("チェックCLIは重複した番号・ファイル名を表示し非ゼロ終了する", async (t) => {
  const directory = await fixture(t);
  const filenames = ["20261005142345_first.sql", "20261005142345_second.sql"];
  await Promise.all(filenames.map((filename) => writeFile(join(directory, filename), "select 1;\n")));
  const result = await nodeProcess([checkerPath, "--directory", directory]);
  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes("20261005142345"));
  for (const filename of filenames) assert.ok(result.stderr.includes(filename));
});

test("チェックCLIは形式不正も拒否し、SQL以外の補足ファイルは無視する", async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, "README.md"), "補足\n");
  await writeFile(join(directory, "20261005142345_valid.sql"), "select 1;\n");
  const valid = await nodeProcess([checkerPath, "--directory", directory]);
  assert.equal(valid.code, 0, valid.stderr);
  assert.match(valid.stdout, /1件すべてOK/);
  await writeFile(join(directory, "20261005142346_invalid.SQL"), "select 2;\n");
  const invalid = await nodeProcess([checkerPath, "--directory", directory]);
  assert.equal(invalid.code, 1);
  assert.ok(invalid.stderr.includes("20261005142346_invalid.SQL"));
});

test("作成CLIは説明名から作成し、日時番号の手指定や余分な引数を拒否する", async (t) => {
  const directory = await fixture(t);
  const creatorPath = fileURLToPath(creatorUrl);
  const before = formatUtcTimestamp(new Date());
  const created = await nodeProcess([creatorPath, "add_profile", "--directory", directory]);
  const after = formatUtcTimestamp(new Date());
  assert.equal(created.code, 0, created.stderr);
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  const migration = parseMigrationFilename(entries[0]);
  assert.equal(migration.name, "add_profile");
  assert.ok(migration.version >= before && migration.version <= after);
  assert.ok(created.stdout.includes(basename(entries[0])));
  const invalid = await nodeProcess([creatorPath, "another", "--directory", directory, "--timestamp", "20261005000000"]);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /不明な引数/);
  assert.deepEqual(await readdir(directory), entries);
});
