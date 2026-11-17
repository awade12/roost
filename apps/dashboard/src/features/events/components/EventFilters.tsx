import { useState, type FormEvent } from "react";
import { Button, Input, Segmented, Select } from "../../../components/ui/index.ts";
import { formatCompact } from "../../../lib/format.ts";
import { EMPTY_QUERY, type EventQuery, type Facets, type Range } from "../api/use-events.ts";

const RANGES: { value: Range; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const options = (all: string, list: { value: string; count: number }[] | undefined, current: string) => {
  const items = (list ?? []).map((f) => ({ value: f.value, label: f.value, hint: formatCompact(f.count) }));
  // Keep a value picked elsewhere (e.g. from a row) selectable even if it's not in the top list.
  if (current && !items.some((i) => i.value === current)) items.unshift({ value: current, label: current, hint: "" });
  return [{ value: "", label: all, hint: "" }, ...items];
};

type Props = { query: EventQuery; facets: Facets | undefined; onChange: (q: EventQuery) => void };

/** Menus apply at once. */
function MenuFilters({ query, facets, onChange }: Props) {
  const set = (patch: Partial<EventQuery>) => onChange({ ...query, ...patch });
  const active = JSON.stringify({ ...query, range: "" }) !== JSON.stringify({ ...EMPTY_QUERY, range: "" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Time range" options={RANGES} value={query.range} onChange={(range) => set({ range })} />
      <Select aria-label="Event" size="sm" className="w-48" value={query.name} options={options("All events", facets?.names, query.name)} onChange={(name) => set({ name })} />
      <Select aria-label="Build" size="sm" className="w-36" value={query.build} options={options("All builds", facets?.builds, query.build)} onChange={(build) => set({ build })} />
      <Select aria-label="Platform" size="sm" className="w-36" value={query.platform} options={options("All platforms", facets?.platforms, query.platform)} onChange={(platform) => set({ platform })} />
      {active && (
        <Button variant="ghost" className="h-7 px-2" onClick={() => onChange({ ...EMPTY_QUERY, range: query.range })}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** Player and prop are typed, so they apply on Enter rather than on every keystroke. */
function TextFilters({ query, onChange }: Omit<Props, "facets">) {
  const pick = (q: EventQuery) => ({ player: q.player, propKey: q.propKey, propValue: q.propValue });
  const [text, setText] = useState(pick(query));
  const [synced, setSynced] = useState(query);
  // A filter set from outside (clicking a player in the list) replaces what's typed.
  if (synced !== query) {
    setSynced(query);
    setText(pick(query));
  }
  const field = (key: keyof typeof text) => (e: { target: { value: string } }) => setText((t) => ({ ...t, [key]: e.target.value }));
  const apply = (e: FormEvent) => {
    e.preventDefault();
    onChange({ ...query, ...text });
  };
  return (
    <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
      <Input className="w-48" mono placeholder="Player id" value={text.player} onChange={field("player")} />
      <Input className="w-36" mono placeholder="prop key" value={text.propKey} onChange={field("propKey")} />
      <span className="text-faint">=</span>
      <Input className="w-40" mono placeholder="value" value={text.propValue} onChange={field("propValue")} />
      <Button className="h-7 px-3">Apply</Button>
    </form>
  );
}

export function EventFilters(props: Props) {
  return (
    <div className="flex flex-col gap-2">
      <MenuFilters {...props} />
      <TextFilters query={props.query} onChange={props.onChange} />
    </div>
  );
}
