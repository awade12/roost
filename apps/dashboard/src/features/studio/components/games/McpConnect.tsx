import { useState } from "react";
import { Button } from "../../../../components/ui/index.ts";

/** One-line command to connect Claude Code (or any MCP client) to this environment with the new key. */
export function McpConnect({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);
  const command = `claude mcp add --transport http roost ${window.location.origin}/mcp --header "Authorization: Bearer ${rawKey}"`;
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Connect an agent (MCP)</span>
          <span className="text-xs text-muted">Lets Claude Code read this environment's issues, reports and analytics, and resolve issues or change flags.</span>
        </div>
        <Button className="h-7 shrink-0" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy command"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-muted">{command}</pre>
      <span className="text-xs text-muted">
        Other clients: Streamable HTTP at <code className="font-mono">{window.location.origin}/mcp</code> with that header.
      </span>
    </div>
  );
}
