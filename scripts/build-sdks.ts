/**
 * Packages the SDKs so the Roost server can host them under /sdk (no npm or crates.io needed):
 *
 *   dist/sdk/js/roost-sdk-<version>.tgz          npm install <roost>/sdk/js/latest.tgz
 *   dist/sdk/cargo/crates/roost-sdk/<v>.crate    a Cargo sparse registry: games add
 *   dist/sdk/cargo/index/ro/os/roost-sdk           [registries.roost] index = "sparse+<roost>/sdk/cargo/"
 *
 *   node scripts/build-sdks.ts      (pnpm build:sdks)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "dist/sdk");
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString();

function buildJs(): string {
  const pkgDir = join(root, "packages/sdk-js");
  run(join(root, "node_modules/.bin/tsup"), [], pkgDir);
  const source = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { version: string; description: string };
  const stage = join(out, "js/stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  cpSync(join(pkgDir, "dist"), join(stage, "dist"), { recursive: true });
  for (const file of ["CHANGELOG.md", "LICENSE", "README.md"]) cpSync(join(pkgDir, file), join(stage, file));
  // The published manifest: no workspace dependencies, built files only.
  const manifest = {
    name: "@roost/sdk",
    version: source.version,
    description: source.description,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    files: ["dist", "CHANGELOG.md", "LICENSE", "README.md"],
    license: "MIT",
  };
  writeFileSync(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  run("npm", ["pack", "--pack-destination", join(out, "js"), "--silent"], stage);
  rmSync(stage, { recursive: true, force: true });
  const file = `roost-sdk-${source.version}.tgz`;
  writeFileSync(join(out, "js/latest.json"), `${JSON.stringify({ version: source.version, file })}\n`);
  return file;
}

type Dep = { name: string; req: string; kind: string | null; optional: boolean; uses_default_features: boolean; features: string[]; target: string | null; rename: string | null };

/** One line of the sparse index, in Cargo's registry format (v2 for `dep:` features). */
function indexLine(version: string, cksum: string, deps: Dep[], features: Record<string, string[]>): string {
  const plain = Object.fromEntries(Object.entries(features).filter(([, v]) => !v.some((f) => f.startsWith("dep:"))));
  const withDep = Object.fromEntries(Object.entries(features).filter(([, v]) => v.some((f) => f.startsWith("dep:"))));
  return JSON.stringify({
    name: "roost-sdk",
    vers: version,
    deps: deps
      .filter((d) => d.kind !== "dev")
      .map((d) => ({
        name: d.rename ?? d.name,
        req: d.req,
        features: d.features,
        optional: d.optional,
        default_features: d.uses_default_features,
        target: d.target,
        kind: d.kind ?? "normal",
        // Everything the SDK depends on comes from crates.io.
        registry: "https://github.com/rust-lang/crates.io-index",
        ...(d.rename ? { package: d.name } : {}),
      })),
    cksum,
    features: plain,
    features2: withDep,
    yanked: false,
    v: 2,
  });
}

function buildRust(): string {
  const crateDir = join(root, "sdks/rust");
  // Set CARGO_NET_OFFLINE=true to build without network (cargo reads it itself).
  run("cargo", ["package", "--allow-dirty", "--no-verify", "-q"], crateDir);
  const meta = JSON.parse(run("cargo", ["metadata", "--no-deps", "--format-version", "1", "--offline"], crateDir)) as {
    packages: { version: string; features: Record<string, string[]>; dependencies: Dep[] }[];
  };
  const pkg = meta.packages[0];
  if (!pkg) throw new Error("cargo metadata returned no package");
  const crate = readFileSync(join(crateDir, `target/package/roost-sdk-${pkg.version}.crate`));
  const cksum = createHash("sha256").update(crate).digest("hex");
  mkdirSync(join(out, "cargo/crates/roost-sdk"), { recursive: true });
  writeFileSync(join(out, `cargo/crates/roost-sdk/${pkg.version}.crate`), crate);
  mkdirSync(join(out, "cargo/index/ro/os"), { recursive: true });
  // One version per build; older builds keep their own lines if the file already has them.
  const indexPath = join(out, "cargo/index/ro/os/roost-sdk");
  const existing = (() => {
    try {
      return readFileSync(indexPath, "utf8").split("\n").filter((l) => l && !l.includes(`"vers":"${pkg.version}"`));
    } catch {
      return [];
    }
  })();
  writeFileSync(indexPath, `${[...existing, indexLine(pkg.version, cksum, pkg.dependencies, pkg.features)].join("\n")}\n`);
  return pkg.version;
}

mkdirSync(join(out, "js"), { recursive: true });
console.log(`js: ${buildJs()}`);
console.log(`rust: roost-sdk ${buildRust()}`);
