import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/marketplace")({
  beforeLoad: () => {
    throw redirect({ to: "/agents" });
  },
  component: () => null,
});
