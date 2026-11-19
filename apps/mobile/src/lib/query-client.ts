import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx won't fix itself on retry; a dropped connection might.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});
