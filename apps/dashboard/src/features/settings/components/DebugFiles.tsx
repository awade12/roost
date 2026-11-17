import { formatAgo } from "../../../lib/format.ts";
import { useDebugFiles, useDeleteDebugFile, type DebugFile } from "../api/use-debug-files.ts";
import { Section } from "./SettingsSection.tsx";

const size = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const HOW_TO = `# Native (Rust): one .sym per binary, per build
dump_syms target/release/my-game > my-game.sym          # Linux; Windows: my-game.pdb
dump_syms my-game.dSYM/Contents/Resources/DWARF/my-game > my-game.sym   # macOS
pnpm upload:debug-files --endpoint <url> --key <rk_server_…> my-game.sym

# JS (Expo, web): the bundle's .map files, for the build you shipped
pnpm upload:debug-files --endpoint <url> --key <rk_server_…> --build 1.4.2 dist/*.map`;

function Row({ file, canEdit, onDelete }: { file: DebugFile; canEdit: boolean; onDelete: () => void }) {
  return (
    <div className="flex h-10 items-center gap-3 px-4">
      <span className="w-20 shrink-0 text-xs text-muted">{file.kind === "breakpad" ? "Symbols" : "Source map"}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.name}</span>
      <span className="w-32 shrink-0 truncate font-mono text-[11px] text-muted" title={file.debugId || file.build}>
        {file.kind === "breakpad" ? file.debugId.slice(0, 12) : `build ${file.build}`}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted">{size(file.size)}</span>
      <span className="w-20 shrink-0 text-right text-xs text-muted">{formatAgo(file.uploadedAt)}</span>
      {canEdit && (
        <button className="text-xs text-muted hover:text-danger" onClick={onDelete}>
          Delete
        </button>
      )}
    </div>
  );
}

/** What turns raw crash stacks into real function names and lines for this game. */
export function DebugFiles({ gameId, canEdit }: { gameId: string; canEdit: boolean }) {
  const files = useDebugFiles(gameId);
  const remove = useDeleteDebugFile(gameId);
  return (
    <Section
      title="Debug files"
      description="Symbols for native crashes and source maps for JS. Upload them from CI with a server key; matching crashes get real function names and lines."
    >
      {files.isPending && <p className="px-4 py-3 text-muted">Loading…</p>}
      {files.isError && <p className="px-4 py-3 text-danger">{files.error.message}</p>}
      {files.data?.map((f) => (
        <Row key={f.id} file={f} canEdit={canEdit} onDelete={() => remove.mutate(f.id)} />
      ))}
      {remove.error && <p className="px-4 py-3 text-xs text-danger">{remove.error.message}</p>}
      {files.data?.length === 0 && (
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-xs text-muted">Nothing uploaded yet. Crashes still arrive, just with raw addresses or minified names.</p>
          <pre className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] text-muted">{HOW_TO}</pre>
        </div>
      )}
    </Section>
  );
}
