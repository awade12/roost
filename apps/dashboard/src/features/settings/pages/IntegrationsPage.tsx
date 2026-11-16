import { ChannelsCard } from "../../alerts/index.ts";
import { LinearCard } from "../../integrations/index.ts";
import { useCurrentOrg } from "../../studio/index.ts";

export function IntegrationsPage() {
  const org = useCurrentOrg();
  if (!org) return null;
  return (
    <div className="flex flex-col gap-5">
      <ChannelsCard orgId={org.id} role={org.role} />
      <LinearCard orgId={org.id} isOwner={org.role === "owner"} />
    </div>
  );
}
