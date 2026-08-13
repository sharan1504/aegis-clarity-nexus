// Genesys OAuth redirect target. Exchanges the authorization code server-side,
// then returns the user to the Integrations page.
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeGenesysOAuth } from "@/lib/integrations-genesys.functions";
import { pageHead } from "@/lib/seo";

interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/integrations/genesys/callback")({
  ssr: false,
  head: () =>
    pageHead({
      path: "/integrations/genesys/callback",
      title: "Connecting Genesys Cloud — Aegis AI",
      description:
        "Completing the Genesys Cloud read-only OAuth authorization for your Aegis AI workspace.",
    }),
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description:
      typeof search.error_description === "string" ? search.error_description : undefined,
  }),
  component: GenesysCallbackPage,
});

function GenesysCallbackPage() {
  const search = Route.useSearch();
  const complete = useServerFn(completeGenesysOAuth);
  const navigate = useNavigate();
  const router = useRouter();
  const [state, setState] = useState<
    { phase: "working" } | { phase: "done"; org: string } | { phase: "error"; message: string }
  >({ phase: "working" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await complete({
          data: {
            code: search.code ?? "",
            state: search.state ?? "",
            error: search.error ?? search.error_description ?? "",
          },
        });
        if (!active) return;
        if (res.ok) {
          setState({ phase: "done", org: res.orgName });
          router.invalidate();
          setTimeout(() => navigate({ to: "/integrations" }), 1200);
        } else {
          setState({ phase: "error", message: res.errorMessage });
        }
      } catch {
        if (active) {
          setState({ phase: "error", message: "The Genesys authorization could not be completed." });
        }
      }
    })();
    return () => {
      active = false;
    };
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
            Genesys Cloud authorization
          </CardTitle>
          <CardDescription>
            {state.phase === "working" && "Exchanging the authorization code and verifying access…"}
            {state.phase === "done" && `Connected to ${state.org}. Returning to Integrations…`}
            {state.phase === "error" && state.message}
          </CardDescription>
        </CardHeader>
        {state.phase === "error" && (
          <CardContent>
            <Button size="sm" onClick={() => navigate({ to: "/integrations" })}>
              Back to Integrations
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
