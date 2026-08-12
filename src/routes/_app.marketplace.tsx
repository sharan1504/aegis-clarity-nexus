import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Check, Download, Lock, Search, Store } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatusPill } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { marketplaceAgents, type MarketplaceAgent } from "@/lib/mock-data";
import { useRole } from "@/lib/rbac";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/marketplace")({
  head: () => pageHead({ path: "/marketplace", title: "Agent Marketplace — Aegis AI", description: "Browse the catalog of enterprise AI agents for FinOps, security, licensing, and service desk work, then install or request access." }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const { can } = useRole();
  const [items, setItems] = useState<MarketplaceAgent[]>(marketplaceAgents);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const categories = useMemo(
    () => Array.from(new Set(marketplaceAgents.map((a) => a.category))),
    [],
  );

  const filtered = useMemo(() => {
    return items.filter((a) => {
      const matchQ = q.trim() === "" ||
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        a.description.toLowerCase().includes(q.toLowerCase()) ||
        a.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()));
      const matchCat = cat === "all" || a.category === cat;
      return matchQ && matchCat;
    });
  }, [items, q, cat]);

  const install = (a: MarketplaceAgent) => {
    setItems((xs) => xs.map((x) => (x.id === a.id ? { ...x, status: "installed" } : x)));
    toast.success(`Installed ${a.name}`, { description: "Agent is now available in AI Agents." });
  };

  const requestAccess = (a: MarketplaceAgent) => {
    toast.success(`Access requested for ${a.name}`, {
      description: `${a.publisher} will approve your enterprise entitlement.`,
    });
  };

  return (
    <div>
      <PageHeader
        title="Agent Marketplace"
        description="Browse and install specialized AI agents built by Aegis Labs and enterprise partners."
        actions={
          <Button size="sm" variant="outline">
            <Store className="mr-1.5 h-4 w-4" /> Submit an agent
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agents, publishers, integrations…"
              className="h-9 pl-9"
            />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">{filtered.length} agents</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <Card key={a.id} className="flex flex-col transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Bot className="h-5 w-5" />
                </div>
                {a.status === "installed" && <StatusPill tone="success" icon={Check}>Installed</StatusPill>}
                {a.status === "request_access" && <StatusPill tone="warning" icon={Lock}>Request access</StatusPill>}
                {a.status === "available" && <StatusPill tone="info">Available</StatusPill>}
              </div>
              <CardTitle className="mt-3 text-base">{a.name}</CardTitle>
              <CardDescription className="line-clamp-2">{a.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal">{t}</Badge>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{a.publisher}</span>
                <span>{a.installs} installs</span>
              </div>
              <div className="flex gap-2 pt-1">
                {a.status === "installed" ? (
                  <Button size="sm" variant="outline" className="flex-1" disabled>
                    <Check className="mr-1.5 h-4 w-4" /> Installed
                  </Button>
                ) : a.status === "request_access" ? (
                  <Button size="sm" className="flex-1" onClick={() => requestAccess(a)} disabled={!can("agents.deploy")}>
                    <Lock className="mr-1.5 h-4 w-4" /> Request access
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1" onClick={() => install(a)} disabled={!can("agents.deploy")}>
                    <Download className="mr-1.5 h-4 w-4" /> Install
                  </Button>
                )}
                <Button size="sm" variant="ghost">Details</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No agents match your search.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
