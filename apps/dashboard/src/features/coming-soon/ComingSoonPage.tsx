import { Card } from "../../components/ui/index.ts";
import { EmptyState } from "../../components/ui/index.ts";

/** Placeholder for sections that are designed but not built yet. */
export function ComingSoonPage({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="px-8 py-6">
      <Card>
        <EmptyState title={`${title} is coming`}>{blurb}</EmptyState>
      </Card>
    </div>
  );
}
