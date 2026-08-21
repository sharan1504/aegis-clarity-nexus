import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plug, Loader2, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GenesysCard } from "@/components/integrations/GenesysCard";
import { pageHead } from "@/lib/seo";
import { getProviderCatalog, startProviderConnection } from "@/lib/integrations/provider-functions";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations — Aegis AI", description: "Connect enterprise systems using real provider authentication and synchronized data." }),
  component: IntegrationsPage,
});

type Provider = Awaited<ReturnType<typeof getProviderCatalog>>["providers"][number];

function statusUi(configured: boolean, provider: Provider) {
  if (provider.id === "genesys") return { label: "Available", cls: "bg-muted text-muted-foreground border-border", icon: Plug };
  if (configured) return { label: "Configured", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 };
  return { label: "Not connected", cls: "bg-muted text-muted-foreground border-border", icon: Plug };
}

function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [target, setTarget] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProviderCatalog().then((r) => setProviders(r.providers)).catch(() => setMessage("Unable to load provider catalog."));
  }, []);

  const connect = async () => {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await startProviderConnection({ data: { provider: target.id } });
      if (result.ok && "authorizeUrl" in result) {
        window.location.assign(result.authorizeUrl);
        return;
      }
      setMessage(result.errorMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection could not be started.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Integrations" description="Only real provider connections are shown. A provider is never marked Connected by the UI alone." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GenesysCard />
        {providers.filter((p) => p.id !== "genesys").map((provider) => {
          const status = statusUi(provider.configured, provider);
          return (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-xl">{provider.name.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                    <CardDescription>{provider.category}</CardDescription>
                  </div>
                  <Badge variant="outline" className={status.cls}><status.icon className="mr-1 h-3 w-3" />{status.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{provider.description}</p>
                <div className="text-xs text-muted-foreground">Auth: {provider.auth}</div>
                <Button size="sm" className="w-full" onClick={() => { setTarget(provider); setMessage(null); }}>
                  Connect
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>Connect {target.name}</DialogTitle>
                <DialogDescription>
                  Aegis will start the provider's real authentication flow. It will not claim success until the server validates credentials and the provider connection.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <div className="rounded-md border p-3"><strong>Authentication:</strong> {target.auth}</div>
                <div className="rounded-md border p-3"><strong>Capabilities:</strong> {target.capabilities.join(", ")}</div>
                {message && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">{message}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
                <Button onClick={connect} disabled={busy}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
                  {busy ? "Starting…" : "Start authentication"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
