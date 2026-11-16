export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <rect width="20" height="20" rx="5" className="fill-fg" />
      <path d="M5.5 12.5c2-4 6-4.8 8.5-2.6" className="stroke-bg" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="12.6" cy="7" r="1.2" className="fill-bg" />
    </svg>
  );
}
