import { Select } from "../../../components/ui/index.ts";
import { selectEnvironment } from "../api/selected-environment.ts";
import { useEnvironment } from "../api/use-environment.ts";

/** Header control: pick which game + environment the dashboard shows. */
export function EnvironmentPicker() {
  const { games, selected } = useEnvironment();
  if (!games.data || games.data.length === 0 || !selected) return null;
  const options = games.data.flatMap((game) =>
    game.environments.map((env) => ({ value: env.id, label: `${game.name} · ${env.name}`, group: game.name })),
  );
  return (
    <Select
      aria-label="Game and environment"
      size="sm"
      align="end"
      className="w-56"
      value={selected.env.id}
      options={options}
      onChange={selectEnvironment}
    />
  );
}
