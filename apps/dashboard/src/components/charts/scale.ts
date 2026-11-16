/** A "nice" step (1, 2 or 5 × 10^n) so axis labels read as round numbers. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / magnitude;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * magnitude;
}

/** Y-axis ticks from 0 with `intervals` equal round steps covering `max`. */
export function yTicks(max: number, intervals = 3): number[] {
  const step = niceStep(max / intervals);
  return Array.from({ length: intervals + 1 }, (_, i) => i * step);
}

/** Evenly spaced indexes for x-axis labels, always including first and last. */
export function xLabelIndexes(length: number, count = 5): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}
