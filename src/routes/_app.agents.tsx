import { createFileRoute } from "@tanstack/react-router";
import { Plus, Play, Pause } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { agents } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <div>
      <PageHeader
        title="AI Agents"
        description="Specialized agents that continuously operate across your enterprise stack."
        actions={
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Deploy Agent
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <Card key={a.id} className="flex flex-col transition hover:border-primary/40">
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
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                <div>
                  <div className="text-muted-foreground">This week</div>
                  <div className="mt-0.5 font-semibold text-foreground">{a.actionsThisWeek} actions</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Impact</div>
                  <div className="mt-0.5 font-semibold text-success">{a.savings}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{a.category}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost">
                    {a.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline">
                    Configure
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
