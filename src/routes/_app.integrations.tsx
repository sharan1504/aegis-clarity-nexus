import { useEffect, useState } from "react";
import { CheckCircle2, Plug, ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GenesysCard } from "@/components/integrations/GenesysCard";
import { pageHead } from "@/lib/seo";
import { getProviderCatalog } from "@/lib/integrations/provider-functions";

export const Route = createFileRoute("/_app/integrations")({
  head: () =>
    pageHead({
      path: "/integrations",
      title: "Integrations — Aegis AI",
      description:
        "Connect enterprise systems using real provider authentication and synchronized data.",
    }),
  component: IntegrationsPage,
});

type Provider = Awaited<ReturnType<typeof getProviderCatalog>>["providers"][number];

function statusUi(configured: boolean) {
  return configured
    ? {
        label: "Connected",
        cls: "bg-success/15 text-success border-success/30",
        icon: CheckCircle2,
      }
    : {
        label: "Coming soon",
        cls: "bg-muted text-muted-foreground border-border",
        icon: Plug,
      };
}

function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    getProviderCatalog()
      .then((r) => setProviders(r.providers))
      .catch(() => setMessage("Unable to load provider catalog."));
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connections are verified against the real provider before Aegis marks them connected."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GenesysCard />
        {providers
          .filter((p) => p.id !== "genesys")
          .map((provider) => {
            const implemented = false;
            const status = statusUi(provider.configured && implemented);
            return (
              <Card key={provider.id}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-xl">
                      {provider.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                      <CardDescription>{provider.category}</CardDescription>
                    </div>
                    <Badge variant="outline" className={status.cls}>
                      <status.icon className="mr-1 h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{provider.description}</p>
                  <div className="text-xs text-muted-foreground">Auth: {provider.auth}</div>
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    This connector is registered in Aegis but its production provider implementation is not yet available.
                  </div>
                  <Button size="sm" variant="outline" className="w-full" disabled={!implemented}>
                    Not yet available
                  </Button>
                </CardContent>
              </Card>
            );
          })}
      </div>
      {message && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {message}
        </div>
      )}
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        Aegis does not mark an unimplemented provider as connected or simulate a successful configuration.
      </div>
    </div>
  );
}
