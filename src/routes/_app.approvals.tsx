import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X, Clock, CheckCircle2 } from "lucide-react";

import { PageHeader, SeverityBadge } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { recommendations as seed, type Recommendation } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [items, setItems] = useState<Recommendation[]>(seed);
  const update = (id: string, status: Recommendation["status"]) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));

  const buckets = {
    pending: items.filter((i) => i.status === "pending"),
    approved: items.filter((i) => i.status === "approved" || i.status === "applied"),
    rejected: items.filter((i) => i.status === "rejected"),
  };

  return (
    <div>
      <PageHeader
        title="Approval Center"
        description="Human-in-the-loop review for all AI-proposed actions before execution."
      />

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
            {buckets[k].map((r) => (
              <Card key={r.id}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={r.severity} />
                      <Badge variant="outline">{r.category}</Badge>
                      <span className="text-xs text-muted-foreground">Proposed by {r.agent}</span>
                    </div>
                    <CardTitle className="mt-2 text-base">{r.title}</CardTitle>
                    <CardDescription className="mt-1">
                      Estimated impact: <span className="font-medium text-success">{r.impact}</span>
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.status === "pending" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => update(r.id, "rejected")}>
                          <X className="mr-1.5 h-4 w-4" /> Reject
                        </Button>
                        <Button size="sm" onClick={() => update(r.id, "approved")}>
                          <Check className="mr-1.5 h-4 w-4" /> Approve
                        </Button>
                      </>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        <Clock className="mr-1 h-3 w-3" /> {r.status}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Preview: this action will run against the connected system with full audit logging.
                  A rollback plan is generated automatically.
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
