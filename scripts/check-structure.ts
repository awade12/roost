// Enforces the layout rules from SPEC.md "Code rules":
//   - no source file over 500 lines
//   - no folder with more than 5 source files (subfolders don't count)
// Exempt: generated output, migrations, __tests__ folders, and config files
// that sit directly in the repo root or a package root (outside src/).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const MAX_LINES = 500;
const MAX_FILES_PER_FOLDER = 5;
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".rs", ".css"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "target", ".git", ".turbo", "coverage", "migrations"]);
const ROOT = process.cwd();

const problems: string[] = [];

function isCountedFolder(dir: string): boolean {
  const rel = relative(ROOT, dir).split("/");
  if (rel.includes("__tests__")) return false;
  // Only folders inside src/ (or scripts/) are held to the 5-file rule;
  // package roots hold tool config files that tools expect there.
  return rel.includes("src") || rel[0] === "scripts";
}

function walk(dir: string): void {
  let sourceFiles = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path);
      continue;
    }
    if (!SOURCE_EXT.has(extname(name))) continue;
    sourceFiles += 1;
    const lines = readFileSync(path, "utf8").split("\n").length;
    if (lines > MAX_LINES) {
      problems.push(`${relative(ROOT, path)}: ${lines} lines (max ${MAX_LINES}) - split it`);
    }
  }
  if (isCountedFolder(dir) && sourceFiles > MAX_FILES_PER_FOLDER) {
    problems.push(
      `${relative(ROOT, dir)}/: ${sourceFiles} source files (max ${MAX_FILES_PER_FOLDER}) - use subfolders`,
    );
  }
}

walk(ROOT);

if (problems.length > 0) {
  console.error(`Structure check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("Structure check passed.");
