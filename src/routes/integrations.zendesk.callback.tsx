import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeZendeskOAuth } from "@/lib/integrations/oauth-provider.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/integrations/zendesk/callback")({
  ssr: false,
  head: () => pageHead({ path: "/integrations/zendesk/callback", title: "Connecting Zendesk — CenOps", description: "Completing Zendesk OAuth authorization." }),
  validateSearch: (search: Record<string, unknown>) => ({ code: typeof search.code === "string" ? search.code : "", state: typeof search.state === "string" ? search.state : "", error: typeof search.error === "string" ? search.error : "", error_description: typeof search.error_description === "string" ? search.error_description : "" }),
  component: CallbackPage,
});

function CallbackPage() {
  const search = Route.useSearch();
  const complete = useServerFn(completeZendeskOAuth);
  const navigate = useNavigate();
  const router = useRouter();
  const [phase, setPhase] = useState<{ kind: "working" } | { kind: "done"; name: string } | { kind: "error"; message: string }>({ kind: "working" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (search.error) throw new Error(search.error_description || search.error);
        if (!search.code || !search.state) throw new Error("Zendesk did not return the required OAuth callback parameters.");
        const result = await complete({ data: { state: search.state, code: search.code } });
        if (!active) return;
        setPhase({ kind: "done", name: result.displayName });
        router.invalidate();
        setTimeout(() => navigate({ to: "/integrations" }), 1200);
      } catch (error) {
        if (active) setPhase({ kind: "error", message: error instanceof Error ? error.message : "Zendesk authorization failed." });
      }
    })();
    return () => { active = false; };
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="w-full max-w-md"><CardHeader><CardTitle className="flex items-center gap-2 text-base">{phase.kind === "working" && <Loader2 className="h-4 w-4 animate-spin" />}{phase.kind === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}{phase.kind === "error" && <AlertTriangle className="h-4 w-4 text-warning" />}Zendesk authorization</CardTitle><CardDescription>{phase.kind === "working" && "Exchanging the authorization code and validating the Zendesk account…"}{phase.kind === "done" && `Connected to ${phase.name}. Returning to Integrations…`}{phase.kind === "error" && phase.message}</CardDescription></CardHeader>{phase.kind === "error" && <CardContent><Button size="sm" onClick={() => navigate({ to: "/integrations" })}>Back to Integrations</Button></CardContent>}</Card></main>;
}
