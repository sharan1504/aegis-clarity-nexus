import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Database,
  Lock,
  RotateCcw,
  Bell as BellIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SeverityBadge } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approvalDetails,
  recommendations as seed,
  type Recommendation,
} from "@/lib/mock-data";
import { useRole } from "@/lib/rbac";

export const Route = createFileRoute("/_app/approvals")({
  component: ApprovalsPage,
});

type SortKey = "severity" | "agent" | "recent";
const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function ApprovalsPage() {
  const { can, role } = useRole();
  const [items, setItems] = useState<Recommendation[]>(seed);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("severity");

  const agentOptions = useMemo(
    () => Array.from(new Set(seed.map((r) => r.agent))),
    [],
  );

  const filtered = useMemo(() => {
    let list = [...items];
    if (severity !== "all") list = list.filter((r) => r.severity === severity);
    if (agent !== "all") list = list.filter((r) => r.agent === agent);
    if (sort === "severity") list.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    else if (sort === "agent") list.sort((a, b) => a.agent.localeCompare(b.agent));
    else list.sort((a, b) => a.id.localeCompare(b.id));
    return list;
  }, [items, severity, agent, sort]);

  const update = (id: string, status: Recommendation["status"]) => {
    const rec = items.find((i) => i.id === id);
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    if (rec) {
      if (status === "approved") {
        toast.success("Approval recorded", {
          description: `${rec.title} — queued for execution with audit trail.`,
        });
      } else if (status === "rejected") {
        toast.error("Recommendation rejected", {
          description: `${rec.title} — logged with your identity as reviewer.`,
        });
      }
    }
  };

  const buckets = {
    pending: filtered.filter((i) => i.status === "pending"),
    approved: filtered.filter((i) => i.status === "approved" || i.status === "applied"),
    rejected: filtered.filter((i) => i.status === "rejected"),
  };

  return (
    <div>
      <PageHeader
        title="Approval Center"
        description="Human-in-the-loop review for all AI-proposed actions before execution."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk</span>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risks</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Agent</span>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agentOptions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="severity">Risk (high→low)</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="recent">Most recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Reviewing as <span className="font-medium text-foreground">{role}</span>
            {!can("approvals.approve") && " · read-only for approvals"}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending <Badge variant="secondary" className="ml-2">{buckets.pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved <Badge variant="secondary" className="ml-2">{buckets.approved.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected <Badge variant="secondary" className="ml-2">{buckets.rejected.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected"] as const).map((k) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-3">
            {buckets[k].length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Nothing here.</p>
                </CardContent>
              </Card>
            )}
            {buckets[k].map((r) => {
              const detail = approvalDetails[r.id];
              const isOpen = expanded === r.id;
              return (
                <Card key={r.id} className="transition hover:border-primary/30">
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={r.severity} />
                        <Badge variant="outline">{r.category}</Badge>
                        <span className="text-xs text-muted-foreground">Proposed by {r.agent}</span>
                      </div>
                      <CardTitle className="mt-2 text-base">{r.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Estimated impact:{" "}
                        <span className="font-medium text-success">{r.impact}</span>
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => update(r.id, "rejected")}
                            disabled={!can("approvals.reject")}
                          >
                            <X className="mr-1.5 h-4 w-4" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => update(r.id, "approved")}
                            disabled={!can("approvals.approve")}
                          >
                            <Check className="mr-1.5 h-4 w-4" /> Approve
                          </Button>
                        </>
                      ) : (
                        <Badge variant="secondary" className="capitalize">
                          <Clock className="mr-1 h-3 w-3" /> {r.status}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        aria-label={isOpen ? "Collapse detail" : "Expand detail"}
                      >
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  {isOpen && detail && (
                    <CardContent className="space-y-4 border-t border-border pt-4 text-sm">
                      <section>
                        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Rationale
                        </div>
                        <p className="text-foreground/90">{detail.rationale}</p>
                      </section>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <section>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <Database className="h-3 w-3" /> Data sources
                          </div>
                          <ul className="space-y-1 text-foreground/90">
                            {detail.dataSources.map((d) => (
                              <li key={d} className="flex items-start gap-1.5">
                                <Lock className="mt-0.5 h-3 w-3 text-muted-foreground" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                        <section>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <RotateCcw className="h-3 w-3" /> Rollback plan
                          </div>
                          <p className="text-foreground/90">{detail.rollback}</p>
                        </section>
                        <section>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <BellIcon className="h-3 w-3" /> Notifications
                          </div>
                          <ul className="space-y-1 text-foreground/90">
                            {detail.notify.map((n) => (
                              <li key={n}>• {n}</li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
