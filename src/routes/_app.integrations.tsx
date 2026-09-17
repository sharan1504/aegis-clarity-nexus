import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsLayout,
});

function IntegrationsLayout() {
  return <Outlet />;
}
