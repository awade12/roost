import type { SVGProps } from "react";

// 16px line icons. They use currentColor, so Tailwind text-* classes color them.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export const OverviewIcon = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </Icon>
);
export const EventsIcon = () => (
  <Icon>
    <path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />
  </Icon>
);
export const RetentionIcon = () => (
  <Icon>
    <path d="M2.5 2.5v11h11M4.8 4.5c1.2 4.2 3.8 6.6 8.2 7" />
  </Icon>
);
export const FunnelIcon = () => (
  <Icon>
    <path d="M2 3h12l-4.5 5.5V13l-3-1.5V8.5z" />
  </Icon>
);
export const PlayersIcon = () => (
  <Icon>
    <circle cx="8" cy="5.5" r="2.8" />
    <path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2" />
  </Icon>
);
export const IssuesIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 5v3.5" />
    <circle cx="8" cy="10.8" r=".6" fill="currentColor" />
  </Icon>
);
export const ReportsIcon = () => (
  <Icon>
    <path d="M2.5 3.5h11v7.5H7.2l-3 2.5v-2.5H2.5z" />
    <path d="M6.5 9V5.5h3.2l-.8 1 .8 1H6.5" strokeWidth="1.1" />
  </Icon>
);
export const AiIcon = () => (
  <Icon>
    <path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12l-1.4-3.6L3 7l3.6-1.4z" />
  </Icon>
);
export const ConfigIcon = () => (
  <Icon>
    <rect x="2" y="4" width="12" height="8" rx="4" />
    <circle cx="10" cy="8" r="2" fill="currentColor" />
  </Icon>
);
export const UpdatesIcon = () => (
  <Icon>
    <path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 9.5v4h11v-4" />
  </Icon>
);
export const SignOutIcon = () => (
  <Icon>
    <path d="M9.5 2.5h-6v11h6M7 8h7M11.5 5.5L14 8l-2.5 2.5" />
  </Icon>
);
export const KeyIcon = () => (
  <Icon>
    <circle cx="5.5" cy="10.5" r="3" />
    <path d="M7.6 8.4L13.5 2.5M11 5l1.8 1.8M9.5 6.5l1.3 1.3" />
  </Icon>
);

export const AlertsIcon = () => (
  <Icon>
    <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1.2 1.5H2.8z" />
    <path d="M6.6 14.2h2.8" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.2" />
    <circle cx="8" cy="8" r="4.6" />
    <path d="M8 1.5v1.9M8 12.6v1.9M1.5 8h1.9M12.6 8h1.9M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
  </Icon>
);
