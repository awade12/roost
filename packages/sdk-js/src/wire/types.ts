// What the SDK sends and receives, as plain TypeScript. They mirror @roost/contracts (the API
// validates with those) but don't depend on it, so the published SDK has no Zod and no
// workspace packages. __tests__/wire.test.ts fails to compile if the two drift apart.

type Scalar = string | number | boolean | null;

export type Platform = "ios" | "android" | "web" | "windows" | "macos" | "linux";

export type EventContext = {
  build: string;
  platform: Platform;
  osVersion?: string | undefined;
  deviceModel?: string | undefined;
  locale?: string | undefined;
  sdk: string;
};

export type RoostEvent = {
  id: string;
  name: string;
  ts: string;
  sessionId: string;
  playerId: string;
  value?: number | undefined;
  props?: Record<string, Scalar> | undefined;
};

export type Breadcrumb = {
  name: string;
  ts: string;
  props?: Record<string, Scalar> | undefined;
  category?: string | undefined;
  level?: "debug" | "info" | "warning" | "error" | undefined;
  message?: string | undefined;
};

export type StackFrame = {
  function?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  inApp?: boolean | undefined;
};

export type AttachmentRef = { id: string; name: string; contentType: string; size: number };

type ReportExtras = {
  tags: Record<string, string>;
  contexts: Record<string, Record<string, unknown>>;
  extra: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
  attachments: AttachmentRef[];
};

export type Crash = ReportExtras & {
  id: string;
  kind: "crash" | "error" | "message";
  level?: "fatal" | "error" | "warning" | "info" | undefined;
  type: string;
  message: string;
  stack: string;
  frames?: StackFrame[] | undefined;
  ts: string;
  sessionId: string;
  playerId: string;
  fingerprint?: string[] | undefined;
};

export type PlayerReport = ReportExtras & {
  id: string;
  ts: string;
  playerId: string;
  sessionId?: string | undefined;
  category: "bug" | "feedback" | "crash" | "other";
  message: string;
  email?: string | undefined;
};

export type AiRunResponse = { text: string; model: string; usage: { tokensIn: number; tokensOut: number } };

export type ErrorBody = { error: { code: string; message: string } };

export type FlagType = "boolean" | "string" | "number" | "json";

export type ResolvedFlag = {
  type: FlagType;
  value: unknown;
  variant: "default" | "rollout" | "override";
  reason: "STATIC" | "SPLIT" | "TARGETING_MATCH";
};

export type ConfigResponse = { flags: Record<string, ResolvedFlag>; version: string };
