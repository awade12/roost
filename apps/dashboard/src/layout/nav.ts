import type { ComponentType } from "react";
import {
  AiIcon,
  AlertsIcon,
  ConfigIcon,
  EventsIcon,
  FunnelIcon,
  IssuesIcon,
  OverviewIcon,
  PlayersIcon,
  ReportsIcon,
  RetentionIcon,
  SettingsIcon,
  UpdatesIcon,
} from "../components/icons/nav-icons.tsx";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType;
  /** Unbuilt sections stay in the nav, dimmed with a "soon" tag, and open a placeholder. */
  soon?: boolean;
  /** One line for the placeholder page until the feature ships. */
  blurb: string;
  /** Which sidebar count to show next to it. */
  badge?: "issues" | "reports";
};

export const ANALYTICS_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: OverviewIcon, blurb: "" },
  {
    to: "/events",
    label: "Events",
    icon: EventsIcon,
    blurb: "Browse and filter every event your games send.",
  },
  {
    to: "/retention",
    label: "Retention",
    icon: RetentionIcon,
    blurb: "D1, D7 and D30 cohorts by install day and build.",
  },
  {
    to: "/funnels",
    label: "Funnels",
    icon: FunnelIcon,
    soon: true,
    blurb: "See where players drop off between any events.",
  },
  {
    to: "/players",
    label: "Players",
    icon: PlayersIcon,
    blurb: "Look up one player's sessions, events and crashes.",
  },
];

export const OPERATE_NAV: NavItem[] = [
  { to: "/issues", label: "Issues", icon: IssuesIcon, blurb: "", badge: "issues" },
  { to: "/alerts", label: "Alerts", icon: AlertsIcon, blurb: "" },
  { to: "/reports", label: "Player reports", icon: ReportsIcon, blurb: "", badge: "reports" },
  { to: "/ai", label: "AI proxy", icon: AiIcon, blurb: "" },
  {
    to: "/config",
    label: "Config & flags",
    icon: ConfigIcon,
    blurb: "Change values and roll out features without an app update.",
  },
  {
    to: "/updates",
    label: "OTA updates",
    icon: UpdatesIcon,
    soon: true,
    blurb: "Ship Expo updates to players, with rollouts and rollback.",
  },
];

/** Reached from the sidebar footer, not the nav list. */
export const SETTINGS_ITEM: NavItem = {
  to: "/settings",
  label: "Settings",
  icon: SettingsIcon,
  blurb: "",
};

export const ALL_NAV = [...ANALYTICS_NAV, ...OPERATE_NAV, SETTINGS_ITEM];
