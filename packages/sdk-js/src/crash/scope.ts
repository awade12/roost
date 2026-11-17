import type { Breadcrumb } from "../wire/index.ts";
import { MAX_BREADCRUMBS } from "@roost/contracts/limits";

export type BreadcrumbInput = Omit<Breadcrumb, "ts"> & { ts?: string };

/** Data merged into every report: tags, contexts, extra, and recent breadcrumbs. */
export class Scope {
  tags: Record<string, string> = {};
  contexts: Record<string, Record<string, unknown>> = {};
  extra: Record<string, unknown> = {};
  private crumbs: Breadcrumb[] = [];

  constructor(private readonly maxBreadcrumbs = 50) {}

  setTag(key: string, value: string | number | boolean) {
    this.tags[key] = String(value).slice(0, 200);
  }

  removeTag(key: string) {
    this.tags = Object.fromEntries(Object.entries(this.tags).filter(([k]) => k !== key));
  }

  /** `null` removes the context. */
  setContext(name: string, data: Record<string, unknown> | null) {
    this.contexts = Object.fromEntries(Object.entries(this.contexts).filter(([k]) => k !== name));
    if (data !== null) this.contexts[name] = data;
  }

  setExtra(key: string, value: unknown) {
    this.extra[key] = value;
  }

  addBreadcrumb(crumb: BreadcrumbInput) {
    this.crumbs.push({ ...crumb, ts: crumb.ts ?? new Date().toISOString() });
    const max = Math.min(this.maxBreadcrumbs, MAX_BREADCRUMBS);
    if (this.crumbs.length > max) this.crumbs.splice(0, this.crumbs.length - max);
  }

  breadcrumbs(): Breadcrumb[] {
    return [...this.crumbs];
  }
}
