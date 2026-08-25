import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Avoid refetching the same route immediately during normal navigation.
    // Critical/volatile pages already expose explicit Refresh actions.
    defaultStaleTime: 15_000,
    defaultPreloadStaleTime: 30_000,
    defaultGcTime: 5 * 60_000,
  });

  return router;
};
