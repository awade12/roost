import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Card } from "./components/ui/index.ts";
import { EmptyState } from "./components/ui/index.ts";
import { AiPage } from "./features/ai/index.ts";
import { ComingSoonPage } from "./features/coming-soon/index.ts";
import { IssuePage, IssuesPage } from "./features/issues/index.ts";
import { OverviewPage } from "./features/overview/index.ts";
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

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: GamesPage });
const aiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ai", component: AiPage });
const issuesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/issues", component: IssuesPage });
const issueRoute = createRoute({ getParentRoute: () => rootRoute, path: "/issues/$issueId", component: IssuePage });
const BUILT = new Set(["/", "/settings", "/ai", "/issues"]);

// Every other nav section gets a placeholder until it is built.
const placeholderRoutes = ALL_NAV.filter((item) => !BUILT.has(item.to)).map((item) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: item.to,
    component: () => <ComingSoonPage title={item.label} blurb={item.blurb} />,
  }),
);

export const router = createRouter({
  routeTree: rootRoute.addChildren([overviewRoute, settingsRoute, aiRoute, issuesRoute, issueRoute, ...placeholderRoutes]),
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
