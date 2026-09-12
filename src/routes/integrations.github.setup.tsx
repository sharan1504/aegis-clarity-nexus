import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageHead } from "@/lib/seo";
import { completeGitHubAppInstall } from "@/lib/integrations/github-app.functions";

interface SetupSearch {
  installation_id?: string;
  state?: string;
  setup_action?: string;
}

export const Route = createFileRoute("/integrations/github/setup")({
  ssr: false,
  head: () => pageHead({ path: "/integrations/github/setup", title: "Connecting GitHub — Aegis AI", description: "Completing the GitHub App installation for your Aegis AI workspace." }),
  validateSearch: (search: Record<string, unknown>): SetupSearch => ({
    installation_id: typeof search.installation_id === "string" ? search.installation_id : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    setup_action: typeof search.setup_action === "string" ? search.setup_action : undefined,
  }),
  component: GitHubSetupPage,
});

function GitHubSetupPage() {
  const search = Route.useSearch();
  const complete = useServerFn(completeGitHubAppInstall);
  const navigate = useNavigate();
  const [state, setState] = useState<{ phase: "working" } | { phase: "done"; account: string; repositories: number } | { phase: "error"; message: string }>({ phase: "working" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await complete({ data: { installationId: search.installation_id, state: search.state, setupAction: search.setup_action } });
        if (!active) return;
        if (result.ok) {
          setState({ phase: "done", account: result.accountLogin, repositories: result.repositoriesVisible });
          setTimeout(() => navigate({ to: "/integrations" }), 1400);
        } else {
          setState({ phase: "error", message: result.errorMessage });
        }
      } catch {
        if (active) setState({ phase: "error", message: "The GitHub App installation could not be completed." });
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {state.phase === "working" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {state.phase === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}
            {state.phase === "error" && <AlertTriangle className="h-4 w-4 text-warning" />}
            GitHub App connection
          </CardTitle>
          <CardDescription>
            {state.phase === "working" && "Verifying the GitHub installation and repository access…"}
            {state.phase === "done" && `Connected to ${state.account}. ${state.repositories} repository${state.repositories === 1 ? "" : "ies"} available. Returning to Integrations…`}
            {state.phase === "error" && state.message}
          </CardDescription>
        </CardHeader>
        {state.phase === "error" && <CardContent><Button size="sm" onClick={() => navigate({ to: "/integrations" })}>Back to Integrations</Button></CardContent>}
      </Card>
    </main>
  );
}
