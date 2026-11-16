import type { ReactNode } from "react";
import { Button } from "../actions/Button.tsx";
import { Dialog } from "./Dialog.tsx";

type Props = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** "danger" for destructive actions like revoke or delete. */
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Replaces window.confirm(): matches the UI and says exactly what will happen. */
export function ConfirmDialog({ open, title, description, confirmLabel, tone = "default", pending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={pending} onClick={onConfirm}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
