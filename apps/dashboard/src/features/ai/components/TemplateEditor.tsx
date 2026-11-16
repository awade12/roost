import { useState, type FormEvent } from "react";
import { Button, ConfirmDialog, Dialog, Field, Input, Textarea } from "../../../components/ui/index.ts";
import type { AiTemplate } from "../api/use-ai.ts";
import { useDeleteTemplate, useSaveTemplate, type TemplateForm } from "../api/use-ai-mutations.ts";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const FORM_ID = "template-editor";
const blank: TemplateForm = { name: "", model: "", fallbackModels: [], systemPrompt: "", userTemplate: "", maxTokens: 500, temperature: 0.7 };

type Props = { gameId: string; template: AiTemplate | null; onClose: () => void };

function Footer({ template, pending, onDelete, onClose }: { template: AiTemplate | null; pending: boolean; onDelete: () => void; onClose: () => void }) {
  return (
    <>
      {template && (
        <Button type="button" variant="ghost" className="mr-auto hover:text-danger" onClick={onDelete}>
          Delete
        </Button>
      )}
      <Button type="button" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form={FORM_ID} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

type SetField = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => void;

function Tuning({ form, set }: { form: TemplateForm; set: SetField }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Max output tokens">
        <Input type="number" min={1} max={4000} required value={form.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value))} />
      </Field>
      <Field label="Temperature" hint="0 = predictable, 1+ = more varied">
        <Input type="number" min={0} max={2} step={0.1} required value={form.temperature} onChange={(e) => set("temperature", Number(e.target.value))} />
      </Field>
    </div>
  );
}

/** Create or edit a prompt template. Saving an edit bumps its version. */
export function TemplateEditor({ gameId, template, onClose }: Props) {
  const [form, setForm] = useState<TemplateForm>(template ?? blank);
  const [fallbacks, setFallbacks] = useState((template?.fallbackModels ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveTemplate(gameId);
  const remove = useDeleteTemplate(gameId);
  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const vars = [...new Set([...form.userTemplate.matchAll(PLACEHOLDER)].map((m) => m[1]))];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fallbackModels = fallbacks.split(",").map((s) => s.trim()).filter(Boolean);
    save.mutate({ id: template?.id ?? null, form: { ...form, fallbackModels } }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={template ? `Edit ${template.name}` : "New prompt template"}
      description={template ? `Version ${template.version}. Saving creates version ${template.version + 1}.` : "Games call it by name with variables; the prompt stays on the server."}
      footer={<Footer template={template} pending={save.isPending} onDelete={() => setConfirmDelete(true)} onClose={onClose} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" hint="What the game calls, e.g. coach_chat">
            <Input mono required pattern="[a-z][a-z0-9_]*" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Model" hint="OpenRouter id, e.g. anthropic/claude-haiku-4.5">
            <Input mono required value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
        </div>
        <Field label="Fallback models" hint="Comma-separated, tried in order if the model fails. Up to 3.">
          <Input mono value={fallbacks} onChange={(e) => setFallbacks(e.target.value)} />
        </Field>
        <Field label="System prompt">
          <Textarea className="min-h-24" value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        </Field>
        <Field label="User message" hint={vars.length ? `Variables the game must send: ${vars.join(", ")}` : "Use {{variable}} for values the game sends."}>
          <Textarea mono required value={form.userTemplate} onChange={(e) => set("userTemplate", e.target.value)} />
        </Field>
        <Tuning form={form} set={set} />
        {(save.error ?? remove.error) && <p className="text-xs text-danger">{(save.error ?? remove.error)?.message}</p>}
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${template?.name ?? "template"}?`}
        description='Games calling it will get "not found" until a template with this name exists again.'
        confirmLabel="Delete template"
        tone="danger"
        pending={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => template && remove.mutate(template.id, { onSuccess: onClose })}
      />
    </Dialog>
  );
}
