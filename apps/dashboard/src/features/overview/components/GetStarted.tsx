import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, CardHeader } from "../../../components/ui/index.ts";

const SNIPPET = `import { Roost } from "@roost/sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";

const roost = new Roost({
  endpoint: "https://roost.your-studio.com",
  clientKey: "rk_client_…",
  playerId,
  context: { build: "1.0.0", platform: "ios" },
  storage: AsyncStorage,
});

await roost.start();
roost.track("level_start", { level: 1 });`;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-muted">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-medium">{title}</span>
        {children}
      </div>
    </li>
  );
}

/** First-run guide, shown until a game has sent its first events. */
export function GetStarted() {
  return (
    <Card>
      <CardHeader title="Send your first events" />
      <ol className="flex flex-col gap-5 p-4">
        <Step n={1} title="Create a game and a client key">
          <p className="text-muted">
            In{" "}
            <Link to="/settings/games" className="text-fg underline underline-offset-2 hover:text-white">
              Games &amp; keys
            </Link>
            , create a game and copy a client key from its production environment.
          </p>
        </Step>
        <Step n={2} title="Add the SDK to your game">
          <pre className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-xs leading-5 text-fg">
            {SNIPPET}
          </pre>
        </Step>
        <Step n={3} title="Play a session">
          <p className="text-muted">Events show up here within a few seconds.</p>
        </Step>
      </ol>
    </Card>
  );
}
