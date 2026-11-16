import type { QueueStorage, RoostEvent } from "./types.ts";

const STORAGE_KEY = "roost:queue";
/** Hard cap so a long offline period can't eat the device's storage. */
const MAX_QUEUED = 5000;

export class EventQueue {
  private events: RoostEvent[] = [];
  private readonly storage: QueueStorage | undefined;

  constructor(storage?: QueueStorage) {
    this.storage = storage;
  }

  async load(): Promise<void> {
    if (!this.storage) return;
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (raw) this.events = (JSON.parse(raw) as RoostEvent[]).concat(this.events);
    } catch {
      // Corrupt storage must never crash the game; start fresh.
      this.events = [];
    }
  }

  push(event: RoostEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_QUEUED) this.events.splice(0, this.events.length - MAX_QUEUED);
    void this.persist();
  }

  peek(max: number): RoostEvent[] {
    return this.events.slice(0, max);
  }

  drop(count: number): void {
    this.events.splice(0, count);
    void this.persist();
  }

  get size(): number {
    return this.events.length;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // Out of space or storage unavailable: keep going in memory.
    }
  }
}
