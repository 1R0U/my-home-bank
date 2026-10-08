import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  formatMigrationProblems,
  inspectMigrationFiles,
  readMigrationFiles,
} from "./migration-utils.mjs";

/** ローカル・CIで同じファイル名と番号の検証を実行する。 */
export async function checkMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  return inspectMigrationFiles(await readMigrationFiles(directory));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") {
      console.log("使い方: npm run migration:check [-- --directory <ディレクトリ>]");
    } else {
      let directory = DEFAULT_MIGRATIONS_DIRECTORY;
      if (args.length) {
        if (args.length !== 2 || args[0] !== "--directory" || !args[1] || args[1].startsWith("--")) {
          throw new Error("使い方: npm run migration:check [-- --directory <ディレクトリ>]");
        }
        directory = args[1];
      }
      const result = await checkMigrations(directory);
      const problems = formatMigrationProblems(result);
      if (problems.length) {
        console.error(problems.join("\n"));
        process.exitCode = 1;
      } else {
        console.log(`マイグレーションのファイル名と番号: ${result.migrations.length}件すべてOK`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
