import { useState } from "react";
import { Button } from "./Button.tsx";

/** Copies `text` to the clipboard and confirms for a moment. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" className={className ?? "h-7 px-2 text-xs"} onClick={() => void copy()}>
      {copied ? "Copied" : label}
    </Button>
  );
}
