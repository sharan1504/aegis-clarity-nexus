import { createFileRoute } from "@tanstack/react-router";
import { completeSnowflakeOAuth } from "@/lib/integrations/oauth-provider.functions";

export const Route = createFileRoute("/integrations/snowflake/callback")({
  component: Callback,
});

function Callback() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const code = params?.get("code");
  const state = params?.get("state");
  const error = params?.get("error");
  if (typeof window !== "undefined" && state && code) {
    void completeSnowflake({ data: { state, code } }).then(() => window.location.assign("/integrations?provider=snowflake&connected=true")).catch((e) => window.location.assign(`/integrations?provider=snowflake&error=${encodeURIComponent(e instanceof Error ? e.message : "OAuth failed")}`));
  }
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">Snowflake connection</h1><p className="mt-2 text-sm text-muted-foreground">{error ?? "Completing Snowflake authorization…"}</p></main>;
}
