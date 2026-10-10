#!/usr/bin/env node
/**
 * マイグレーションを適用したDBから、テーブルの行の型を生成する（Issue #399）。
 *
 * `types/index.ts` の型（`Quest` など）は手書きで、`select("*")` の結果に `as Quest` で
 * 当てている。手書きのままだと、列を改名・削除してもコンパイルで気づけない。
 * そこで、DBの実物から行の型を生成し、`types/schemaCompat.ts` で手書きの型と突き合わせる。
 *
 * 使い方:
 *   PGURL=postgresql://postgres@localhost:5432/postgres node scripts/generate-db-types.mjs
 *   PGURL=... node scripts/generate-db-types.mjs --check   # 生成結果とコミット済みの差分があれば失敗する
 *
 * CI（DB Migration ジョブ）は全マイグレーションを適用した直後に `--check` で走らせる。
 * マイグレーションで列を変えたのに再生成し忘れると、そこで落ちる。
 *
 * Supabase CLI の `supabase gen types` を使わないのは、Docker が要るため。
 * CIの素の PostgreSQL と psql だけで動くようにしている。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "types", "database.generated.ts");

const pgUrl = process.env.PGURL;
if (!pgUrl) {
  console.error("PGURL が設定されていません（例: postgresql://postgres@localhost:5432/postgres）");
  process.exit(1);
}

const COLUMNS_SQL = `
select coalesce(json_agg(row_to_json(c) order by c.table_name, c.ordinal_position), '[]'::json)
from (
  select
    col.table_name,
    col.column_name,
    col.ordinal_position,
    col.is_nullable = 'YES' as nullable,
    col.data_type,
    col.udt_name,
    (
      select json_agg(e.enumlabel order by e.enumsortorder)
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = col.udt_schema and t.typname = ltrim(col.udt_name, '_')
    ) as enum_values
  from information_schema.columns col
  join information_schema.tables tab
    on tab.table_schema = col.table_schema and tab.table_name = col.table_name
  where col.table_schema = 'public' and tab.table_type = 'BASE TABLE'
) c;
`;

const NUMBER_TYPES = new Set(["int2", "int4", "int8", "numeric", "float4", "float8"]);
const STRING_TYPES = new Set([
  "text", "varchar", "bpchar", "uuid", "date", "time", "timetz", "timestamp", "timestamptz", "citext", "inet",
]);

/** PostgreSQL の型名を TypeScript の型へ変換する。 */
function toTsType(udtName, enumValues) {
  if (enumValues) return enumValues.map((value) => JSON.stringify(value)).join(" | ");
  if (NUMBER_TYPES.has(udtName)) return "number";
  if (STRING_TYPES.has(udtName)) return "string";
  if (udtName === "bool") return "boolean";
  if (udtName === "json" || udtName === "jsonb") return "Json";
  throw new Error(`未対応のPostgreSQLの型です: ${udtName}。scripts/generate-db-types.mjs に追加してください`);
}

function columnType(column) {
  const isArray = column.data_type === "ARRAY";
  const base = toTsType(isArray ? column.udt_name.replace(/^_/, "") : column.udt_name, column.enum_values);
  const type = isArray ? `(${base})[]` : base;
  return column.nullable ? `${type} | null` : type;
}

function generate() {
  const raw = execFileSync("psql", [pgUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", COLUMNS_SQL], { encoding: "utf8" });
  const columns = JSON.parse(raw.trim());

  const tables = new Map();
  for (const column of columns) {
    if (!tables.has(column.table_name)) tables.set(column.table_name, []);
    tables.get(column.table_name).push(column);
  }

  const lines = [
    "// このファイルは scripts/generate-db-types.mjs が生成する。手で編集しない。",
    "// マイグレーションで列を変えたら、全マイグレーションを適用したDBに対して再生成する",
    "// （手順は docs/DEVELOPMENT.md「DBの型を生成する」）。",
    "",
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
    "",
    "/** public スキーマのテーブルごとの、1行の型（`select(\"*\")` で返る形）。 */",
    "export type DbTables = {",
  ];
  for (const [table, tableColumns] of [...tables.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${table}: {`);
    for (const column of tableColumns) {
      lines.push(`    ${column.column_name}: ${columnType(column)};`);
    }
    lines.push("  };");
  }
  lines.push("};", "", "/** テーブルの1行の型。 */", "export type DbRow<T extends keyof DbTables> = DbTables[T];", "");
  return lines.join("\n");
}

const generated = generate();

if (process.argv.includes("--check")) {
  const committed = readFileSync(OUTPUT, "utf8");
  if (committed !== generated) {
    console.error(
      "types/database.generated.ts がDBの実物と一致しません。\n" +
        "マイグレーションで列を変えた場合は、全マイグレーションを適用したDBに対して\n" +
        "`PGURL=... node scripts/generate-db-types.mjs` を実行し、結果をコミットしてください。",
    );
    process.exit(1);
  }
  console.log("types/database.generated.ts はDBの実物と一致しています。");
} else {
  writeFileSync(OUTPUT, generated);
  console.log(`${OUTPUT} を生成しました。`);
}
