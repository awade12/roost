type Point = { x: number; y: number };

const toPath = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/**
 * SVG paths for a line chart of `current`, with `previous` (same length or shorter) on the
 * same scale. Both share one y-axis so the comparison is honest; 8% headroom at the top.
 */
export function chartPaths(current: number[], previous: number[], width: number, height: number) {
  const max = Math.max(1, ...current, ...previous) * 1.08;
  const n = Math.max(current.length, 2);
  const at = (values: number[]) => values.map((v, i) => ({ x: (i / (n - 1)) * (width - 4) + 2, y: height - 2 - (v / max) * (height - 6) }));
  const pts = at(current);
  const last = pts[pts.length - 1] ?? { x: width - 2, y: height - 2 };
  const first = pts[0] ?? { x: 2, y: height - 2 };
  return {
    line: toPath(pts),
    area: `${toPath(pts)} L${last.x.toFixed(1)} ${height} L${first.x.toFixed(1)} ${height} Z`,
    previous: previous.length > 1 ? toPath(at(previous)) : null,
    end: last,
  };
}
