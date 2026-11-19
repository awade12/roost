import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { useSession } from "../SessionProvider.tsx";

/** Emails a 6-digit sign-in code. */
export function useStartOtp() {
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await adminApi.auth.otp.start.$post({ json: { email } });
      if (!res.ok) throw await apiError(res);
    },
  });
}

const TokenBody = z.object({ token: z.string().min(1) });

/** Exchanges the code for a session token (not a cookie: `client: "app"`) and stores it. */
export function useVerifyOtp() {
  const { signIn } = useSession();
  return useMutation({
    mutationFn: async (input: { email: string; code: string }) => {
      const res = await adminApi.auth.otp.verify.$post({ json: { ...input, client: "app" } });
      if (!res.ok) throw await apiError(res);
      const body = TokenBody.safeParse(await res.json());
      // An older server ignores `client` and sets a cookie instead.
      if (!body.success) throw new Error("This Roost server is too old for the app. Update it and try again.");
      await signIn(body.data.token);
    },
  });
}

/** Revokes the session on the server (best effort), then forgets it here. */
export function useSignOut() {
  const { signOut } = useSession();
  return useMutation({
    mutationFn: async () => {
      // Offline or already expired: still sign out locally.
      await adminApi.auth.logout.$post().catch(() => undefined);
      await signOut();
    },
  });
}
