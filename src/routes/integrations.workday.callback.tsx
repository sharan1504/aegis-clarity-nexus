import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { completeWorkdayConnection } from "@/lib/integrations/workday-complete.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/integrations/workday/callback")({
  ssr: false,
  head: () => pageHead({ path: "/integrations/workday/callback", title: "Connecting Workday — CenOps", description: "Completing Workday OAuth authorization." }),
  validateSearch: (search: Record<string, unknown>) => ({ code: typeof search.code === "string" ? search.code : "", state: typeof search.state === "string" ? search.state : "", error: typeof search.error === "string" ? search.error : "", error_description: typeof search.error_description === "string" ? search.error_description : "" }),
  component: CallbackPage,
});

function CallbackPage() {
  const search = Route.useSearch();
  const complete = useServerFn(completeWorkdayConnection);
  const navigate = useNavigate();
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Exchanging the authorization code and validating Workday…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (search.error) throw new Error(search.error_description || search.error);
        if (!search.code || !search.state) throw new Error("Workday did not return the required OAuth callback parameters.");
        const result = await complete({ data: { state: search.state, code: search.code } });
        if (!active) return;
        setState("done");
        setMessage(`Connected to ${result.displayName}. Returning to Integrations…`);
        router.invalidate();
        setTimeout(() => navigate({ to: "/integrations" }), 1200);
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Workday authorization failed.");
      }
    })();
    return () => { active = false; };
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="w-full max-w-md"><CardHeader><CardTitle className="flex items-center gap-2 text-base">{state === "working" && <Loader2 className="h-4 w-4 animate-spin" />}{state === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}{state === "error" && <AlertTriangle className="h-4 w-4 text-warning" />}Workday authorization</CardTitle><CardDescription>{message}</CardDescription></CardHeader>{state === "error" && <CardContent><Button size="sm" onClick={() => navigate({ to: "/integrations" })}>Back to Integrations</Button></CardContent>}</Card></main>;
}
