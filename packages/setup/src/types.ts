export type Platform = "expo" | "web" | "rust";

export type Features = {
  crashes: boolean;
  reports: boolean;
  flags: boolean;
  ai: boolean;
  /** Source maps (JS) or Breakpad symbols (Rust), uploaded from CI. */
  debugFiles: boolean;
  /** Rust only: segfaults and other hard crashes, via a crash monitor process. */
  nativeCrashes: boolean;
};

export type SetupInput = {
  game: string;
  environment: string;
  /** Where the game sends data, e.g. https://roost.example.com. */
  endpoint: string;
  /** A client key to write into the guide, or null to use a placeholder the agent reads from env. */
  clientKey: string | null;
  platform: Platform;
  features: Features;
  /** Existing template names and flag keys, so the agent can wire real ones. */
  templates: string[];
  flags: { key: string; type: string }[];
};

export type SetupFile = { name: string; content: string };

export const ALL_FEATURES: Features = { crashes: true, reports: true, flags: true, ai: true, debugFiles: true, nativeCrashes: true };
