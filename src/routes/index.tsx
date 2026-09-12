import { createFileRoute, Navigate } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => pageHead({ path: "/", title: "Cenops — Enterprise AI Operations", description: "Govern enterprise AI operations with evidence, approvals, guardrails, and auditability." }),
  component: () => <Navigate to="/platform" replace />,
});
