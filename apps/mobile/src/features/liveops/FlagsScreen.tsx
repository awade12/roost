import { View } from "react-native";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { FlagRow, useFlags, useToggleFlag } from "../flags/index.ts";
import { useWorkspace } from "../workspace/index.ts";

/** Every flag in the environment. */
export function FlagsScreen() {
  const { environment } = useWorkspace();
  const flags = useFlags(environment?.id ?? null);
  const toggle = useToggleFlag(environment?.id ?? null);
  const all = flags.data ?? [];
  return (
    <StackScreen back="Live ops" center="Flags">
      {flags.isLoading ? <Loading /> : null}
      {flags.error ? <ErrorState error={flags.error} onRetry={() => void flags.refetch()} /> : null}
      <View>
        {all.map((f, i) => (
          <FlagRow key={f.id} flag={f} onToggle={toggle.mutateAsync} busy={toggle.isPending} last={i === all.length - 1} />
        ))}
      </View>
    </StackScreen>
  );
}
