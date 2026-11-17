import type { SetupFile } from "@roost/setup";
import { useState } from "react";
import { Button, CopyButton, Segmented } from "../../../components/ui/index.ts";

function download(file: SetupFile) {
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Both files as one message, for pasting straight into an agent chat. */
const asPrompt = (files: SetupFile[]) =>
  `Set up Roost in this game. Save these files at the repo root, then follow ROOST.md.\n\n${files.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n")}`;

export function SetupPreview({ files }: { files: SetupFile[] }) {
  const [shown, setShown] = useState(files[0]?.name ?? "");
  const file = files.find((f) => f.name === shown) ?? files[0];
  if (!file) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="File" options={files.map((f) => ({ value: f.name, label: f.name }))} value={file.name} onChange={setShown} />
        <span className="ml-auto flex gap-1.5">
          <CopyButton text={file.content} label={`Copy ${file.name}`} />
          <Button className="h-7 px-2" onClick={() => download(file)}>
            Download
          </Button>
        </span>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{file.content}</pre>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>Easiest: paste both files into your coding agent (Claude Code, Cursor…) as one message.</span>
        <CopyButton text={asPrompt(files)} label="Copy for an agent" />
      </div>
    </div>
  );
}
