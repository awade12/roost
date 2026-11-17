import { writeFile } from "node:fs/promises";
import { call, errorText, type Target } from "../api.ts";

/** Writes the current templates, flags and limits as a config file (a starting point for `push`). */
export async function pull(t: Target, opts: { out: string }): Promise<number> {
  const { status, data } = await call<unknown>(t, "GET", "/manage/config");
  if (status !== 200) {
    console.error(`pull failed (${status}): ${errorText(data)}`);
    return 1;
  }
  const text = opts.out.endsWith(".ts")
    ? `import type { RoostConfig } from "@roost/contracts";\n\nexport const config: RoostConfig = ${JSON.stringify(data, null, 2)};\n`
    : `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(opts.out, text);
  console.log(`Wrote ${opts.out}`);
  return 0;
}
