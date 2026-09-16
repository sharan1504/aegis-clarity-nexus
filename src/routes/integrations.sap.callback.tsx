import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { completeSapOAuth } from "@/lib/integrations/sap.functions";

export const Route = createFileRoute("/integrations/sap/callback")({ component: SapCallback });

function SapCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const providerError = params.get("error");
    if (providerError) {
      setError(`SAP authorization failed: ${providerError}`);
      return;
    }
    if (!code || !state) {
      setError("SAP authorization callback is missing code or state.");
      return;
    }
    void completeSapOAuth({ data: { code, state } })
      .then(() => { if (!cancelled) void navigate({ to: "/integrations" }); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "SAP authorization failed."); });
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) return <main className="mx-auto max-w-xl p-8"><h1 className="text-lg font-semibold">SAP connection failed</h1><p className="mt-2 text-sm text-destructive">{error}</p></main>;
  return <main className="mx-auto flex max-w-xl items-center gap-3 p-8"><Loader2 className="h-5 w-5 animate-spin" /><span>Completing SAP connection…</span></main>;
}
