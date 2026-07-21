import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Plug } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { integrations } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsPage,
});

function statusUi(s: string) {
  if (s === "connected")
    return { label: "Connected", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 };
  if (s === "action_required")
    return { label: "Action required", cls: "bg-warning/20 text-warning-foreground border-warning ring-2 ring-warning/40", icon: AlertTriangle };
  return { label: "Available", cls: "bg-muted text-muted-foreground border-border", icon: Plug };
}

const STATUS_ORDER: Record<string, number> = { action_required: 0, connected: 1, available: 2 };

function IntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect enterprise systems via OAuth 2.0 today, MCP servers as they roll out."
        actions={<Button size="sm" variant="outline">Browse marketplace</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...integrations]
          .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
          .map((i) => {
          const s = statusUi(i.status);
          return (
            <Card key={i.id} className={i.status === "action_required" ? "border-warning/60" : undefined}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-2xl">
                    {i.logo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{i.name}</CardTitle>
                    <CardDescription>{i.category}</CardDescription>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                    <s.icon className="h-3 w-3" /> {s.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{i.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Badge variant="outline" className="font-normal">{i.auth}</Badge>
                    {i.lastSync && <span>• Last sync {i.lastSync}</span>}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  {i.status === "connected" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1">Configure</Button>
                      <Button size="sm" variant="ghost">Disconnect</Button>
                    </>
                  )}
                  {i.status === "action_required" && (
                    <Button size="sm" className="flex-1">Reconnect</Button>
                  )}
                  {i.status === "available" && (
                    <Button size="sm" className="flex-1">Connect</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
