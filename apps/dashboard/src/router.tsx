import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Card } from "./components/ui/index.ts";
import { EmptyState } from "./components/ui/index.ts";
import { AiPage } from "./features/ai/index.ts";
import { AlertsPage } from "./features/alerts/index.ts";
import { ComingSoonPage } from "./features/coming-soon/index.ts";
import { IssuePage, IssuesPage } from "./features/issues/index.ts";
import { ConfigPage } from "./features/config/index.ts";
import { EventsPage } from "./features/events/index.ts";
import { AcceptInvitePage } from "./features/invite/index.ts";
import { OverviewPage } from "./features/overview/index.ts";
import { PlayerPage, PlayersPage } from "./features/players/index.ts";
import { ReportPage, ReportsPage } from "./features/reports/index.ts";
import { RetentionPage } from "./features/retention/index.ts";
import {
  GameSettingsPage,
  IntegrationsPage,
  MembersPage,
  SettingsLayout,
  StudioPage,
} from "./features/settings/index.ts";
import { GamesPage } from "./features/studio/index.ts";
import { AppShell } from "./layout/AppShell.tsx";
import { ALL_NAV } from "./layout/nav.ts";

function NotFound() {
  return (
    <Card className="mx-8 my-6">
      <EmptyState title="Page not found">Pick a section from the sidebar.</EmptyState>
    </Card>
  );
}

const rootRoute = createRootRoute({ component: AppShell });

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
// Settings is a layout with tabs; each tab is a child route.
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
});
const settingsChildren = [
  createRoute({ getParentRoute: () => settingsRoute, path: "/", component: StudioPage }),
  createRoute({ getParentRoute: () => settingsRoute, path: "/members", component: MembersPage }),
  createRoute({ getParentRoute: () => settingsRoute, path: "/games", component: GamesPage }),
  createRoute({
    getParentRoute: () => settingsRoute,
    path: "/integrations",
    component: IntegrationsPage,
  }),
];
const gameSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/games/$gameId",
  // ?setup=1 opens the "Set up in your game" dialog straight away (from game cards, Get started).
  validateSearch: (search: Record<string, unknown>): { setup?: boolean } => (search.setup ? { setup: true } : {}),
  component: function GameSettingsRoute() {
    return <GameSettingsPage gameId={gameSettingsRoute.useParams().gameId} openSetup={gameSettingsRoute.useSearch().setup ?? false} />;
  },
});
const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/events",
  // ?player= lets other pages open Events already filtered (e.g. a player's profile).
  validateSearch: (search: Record<string, unknown>): { player?: string } => (typeof search.player === "string" ? { player: search.player } : {}),
  component: function EventsRoute() {
    return <EventsPage initialPlayer={eventsRoute.useSearch().player} />;
  },
});
const configRoute = createRoute({ getParentRoute: () => rootRoute, path: "/config", component: ConfigPage });
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: function InviteRoute() {
    return <AcceptInvitePage token={inviteRoute.useParams().token} />;
  },
});
const playersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/players", component: PlayersPage });
const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/players/$playerId",
  component: function PlayerRoute() {
    return <PlayerPage playerId={playerRoute.useParams().playerId} />;
  },
});
const retentionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/retention", component: RetentionPage });
const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: ReportsPage,
});
const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/$reportId",
  component: function ReportRoute() {
    return <ReportPage reportId={reportRoute.useParams().reportId} />;
  },
});
const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  component: AlertsPage,
});
const aiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ai", component: AiPage });
const issuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/issues",
  component: IssuesPage,
});
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/issues/$issueId",
  component: IssuePage,
});

// Every other nav section gets a placeholder until it is built.
const placeholderRoutes = ALL_NAV.filter((item) => item.soon).map((item) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: item.to,
    component: () => <ComingSoonPage title={item.label} blurb={item.blurb} />,
  }),
);

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    overviewRoute,
    settingsRoute.addChildren([...settingsChildren, gameSettingsRoute]),
    alertsRoute,
    eventsRoute,
    retentionRoute,
    playersRoute,
    configRoute,
    inviteRoute,
    playerRoute,
    reportsRoute,
    reportRoute,
    aiRoute,
    issuesRoute,
    issueRoute,
    ...placeholderRoutes,
  ]),
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
