import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { aiKey, type AiLimits } from "./use-ai.ts";

export type TemplateForm = {
  name: string;
  model: string;
  fallbackModels: string[];
  systemPrompt: string;
  userTemplate: string;
  maxTokens: number;
  temperature: number;
};

/** Creates a template, or saves an edit (bumping its version) when `id` is given. */
export function useSaveTemplate(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: TemplateForm }) => {
      const res = id
        ? await adminApi.ai.templates[":templateId"].$put({ param: { templateId: id }, json: form })
        : await adminApi.games[":gameId"].ai.templates.$post({ param: { gameId }, json: form });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(gameId) }),
  });
}

export function useDeleteTemplate(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApi.ai.templates[":templateId"].$delete({ param: { templateId: id } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(gameId) }),
  });
}

export function useSaveLimits(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (limits: AiLimits) => {
      const res = await adminApi.games[":gameId"].ai.limits.$put({ param: { gameId }, json: limits });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(gameId) }),
  });
}
