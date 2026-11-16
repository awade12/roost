import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { ME_KEY } from "./use-me.ts";

/** Emails a 6-digit sign-in code. */
export function useStartOtp() {
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await adminApi.auth.otp.start.$post({ json: { email } });
      if (!res.ok) throw await apiError(res);
    },
  });
}

/** Exchanges the code for a session cookie, then reloads the current user. */
export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; code: string }) => {
      const res = await adminApi.auth.otp.verify.$post({ json: input });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await adminApi.auth.logout.$post();
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
}
