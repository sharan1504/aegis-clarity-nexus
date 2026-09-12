import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/marketplace")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/agents" });
  },
  component: () => null,
});
