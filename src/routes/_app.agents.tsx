import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Play, Pause } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SeverityBadge } from "@/components/layout/AppLayout";
import { EmptyIntegrationsState, hasAnyConnected } from "@/components/EmptyIntegrationsState";
import { AgentDataSourceManager } from "@/components/agents/AgentDataSourceManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { agentFindings, agents, type Agent } from "@/lib/mock-data";
import { useRole } from "@/lib/rbac";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/agents")({
  head: () => pageHead({ path: "/agents", title: "AI Agents & Findings — Aegis AI", description: "Run, pause, and audit specialised AI agents for incidents, licensing, cloud cost, and security, and drill into every finding they raise." }),
  component: AgentsPage,
});

function AgentsPage() {
  const connected = hasAnyConnected();
  const { can } = useRole();
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <div>
      <PageHeader
        title="AI Agents"
        description="Specialized agents that continuously operate across your enterprise stack."
        actions={
          <Button size="sm" disabled={!can("agents.deploy")}>
            <Plus className="mr-1.5 h-4 w-4" /> Deploy Agent
          </Button>
        }
      />

      {!connected ? (
        <EmptyIntegrationsState
          title="Agents need a connected system"
          description="Connect at least one integration to activate agents that monitor and act on your stack."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const findings = agentFindings[a.id] ?? [];
            return (
              <Card
                key={a.id}
                onClick={() => setSelected(a)}
                className="flex cursor-pointer flex-col transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <a.icon className="h-5 w-5" />
                    </div>
                    <Badge
                      variant={a.status === "active" ? "default" : a.status === "beta" ? "secondary" : "outline"}
                      className={a.status === "active" ? "bg-success/15 text-success border border-success/30 hover:bg-success/15" : ""}
                    >
                      {a.status}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3 text-base">{a.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{a.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                    <button
                      className="text-left transition hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                    >
                      <div className="text-muted-foreground">This week</div>
                      <div className="mt-0.5 font-semibold text-foreground hover:underline">{a.actionsThisWeek}</div>
                    </button>
                    <button
                      className="text-left transition hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                    >
                      <div className="text-muted-foreground">Findings</div>
                      <div className="mt-0.5 font-semibold text-primary hover:underline">{findings.length}</div>
                    </button>
                    <div>
                      <div className="text-muted-foreground">Impact</div>
                      <div className="mt-0.5 font-semibold text-success">{a.savings}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">{a.category}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!can("agents.pause")}
                        aria-label={a.status === "active" ? `Pause ${a.name}` : `Resume ${a.name}`}
                        onClick={() =>
                          toast.success(a.status === "active" ? `Paused ${a.name}` : `Resumed ${a.name}`)
                        }
                      >
                        {a.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelected(a)}>
                        Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <selected.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <SheetTitle>{selected.name}</SheetTitle>
                    <SheetDescription>{selected.category} · {selected.actionsThisWeek} actions this week</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <p className="mt-4 text-sm text-muted-foreground">{selected.description}</p>

              <div className="mt-5">
                <AgentDataSourceManager agentKey={selected.id} agentName={selected.name} />
              </div>



              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent findings
                </div>
                <div className="space-y-2">
                  {(agentFindings[selected.id] ?? []).map((f) => (
                    <div key={f.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <div className="mt-1 text-sm font-medium">{f.title}</div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>{f.detected}</span>
                        <span className="font-medium text-success">{f.impact}</span>
                      </div>
                    </div>
                  ))}
                  {(agentFindings[selected.id] ?? []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No findings yet for this agent.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
