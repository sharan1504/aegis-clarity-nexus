import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/reports")({ component: ReportsRedirect });

function ReportsRedirect() {
  const navigate = useNavigate();
  useEffect(() => { void navigate({ to: "/analytics" }); }, [navigate]);
  return <div className="py-16 text-center text-sm text-muted-foreground">Opening Analytics Workspace…</div>;
}
