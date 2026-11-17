/**
 * Uploads debug files from CI so crashes show real names and lines.
 *
 *   node scripts/upload-debug-files.ts --endpoint https://roost.example.com --key rk_server_… game.sym
 *   node scripts/upload-debug-files.ts --endpoint … --key … --build 1.4.2 dist/*.map
 *
 * .sym files come from `dump_syms <binary or .pdb> > game.sym` (cargo install dump_syms). On macOS
 * point it at the DWARF file inside the dSYM (game.dSYM/Contents/Resources/DWARF/game), or the module
 * name won't match the crash.
 * .map files are uploaded for --build, named after the bundle they describe (main.js.map → main.js).
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { endpoint: { type: "string" }, key: { type: "string" }, build: { type: "string" } },
});
if (!values.endpoint || !values.key || positionals.length === 0) {
  console.error("usage: upload-debug-files.ts --endpoint <url> --key <rk_server_…> [--build <build>] <files…>");
  process.exit(2);
}

async function upload(file: string): Promise<string> {
  const body = await readFile(file);
  const isMap = file.endsWith(".map");
  if (isMap && !values.build) return "skipped: source maps need --build";
  const query = isMap ? `?${new URLSearchParams({ build: values.build ?? "", name: basename(file).replace(/\.map$/, "") })}` : "";
  const url = `${values.endpoint}/v1/debug-files/${isMap ? "sourcemaps" : "breakpad"}${query}`;
  const res = await fetch(url, { method: "PUT", headers: { "x-roost-key": values.key ?? "" }, body });
  return res.ok ? `ok (${(body.byteLength / 1024).toFixed(0)} KB)` : `failed: ${res.status} ${await res.text()}`;
}

let failed = 0;
for (const file of positionals) {
  const result = await upload(file);
  if (!result.startsWith("ok")) failed += 1;
  console.log(`${file}: ${result}`);
}
process.exit(failed ? 1 : 0);
