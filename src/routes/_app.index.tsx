import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader, SeverityBadge } from "@/components/layout/AppLayout";
import { EmptyIntegrationsState, hasAnyConnected } from "@/components/EmptyIntegrationsState";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  costByCloud,
  healthTrend,
  incidents,
  incidentsByService,
  kpis,
  recommendations,
  securityAlerts,
} from "@/lib/mock-data";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type DrillKey = "Active Incidents" | "Security Alerts" | "Cost Savings (MTD)" | "Platform Health";

function DashboardPage() {
  const connected = hasAnyConnected();
  const [drill, setDrill] = useState<DrillKey | null>(null);
  return (
    <div>
      <PageHeader
        title="AI Dashboard"
        description="Real-time executive view across all connected enterprise systems."
        actions={
          <>
            <Button variant="outline" size="sm">Export</Button>
            <Button size="sm" asChild>
              <Link to="/chat">
                <Sparkles className="mr-1.5 h-4 w-4" /> Ask Aegis
              </Link>
            </Button>
          </>
        }
      />

      {!connected && <EmptyIntegrationsState />}
      {connected && (
      <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={() => setDrill(k.label as DrillKey)}
            className="text-left"
          >
            <Card className="relative overflow-hidden transition hover:border-primary/40 hover:shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wider">
                  {k.label}
                </CardDescription>
                <CardTitle className="text-3xl tracking-tight">{k.value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {k.breakdown && (
                  <div className="mb-1.5 text-xs font-medium text-foreground/80">{k.breakdown}</div>
                )}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      k.trend === "up"
                        ? "text-success"
                        : k.trend === "down"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {k.trend === "up" ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {k.delta}
                  </span>
                  <span className="text-xs text-muted-foreground">{k.hint}</span>
                </div>
              </CardContent>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/60 via-accent/60 to-transparent" />
            </Card>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Platform Health & Spend</CardTitle>
              <CardDescription>Rolling 7-day trend across all connected systems</CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1.5">
              <TrendingUp className="h-3 w-3" /> Improving
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={healthTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gHealth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="health" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gHealth)" />
                <Area type="monotone" dataKey="cost" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gCost)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by Provider</CardTitle>
            <CardDescription>Month to date</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costByCloud}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {costByCloud.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
              {costByCloud.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="ml-auto font-medium">${(c.value / 1000).toFixed(0)}K</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Active Incidents</CardTitle>
              <CardDescription>Live from Genesys, AWS, Azure, ServiceNow, Salesforce</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDrill("Active Incidents")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="px-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.id}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-medium">{i.title}</TableCell>
                    <TableCell className="text-muted-foreground">{i.service}</TableCell>
                    <TableCell><SeverityBadge severity={i.severity} /></TableCell>
                    <TableCell className="capitalize text-muted-foreground">{i.status}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{i.opened}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents by Service</CardTitle>
            <CardDescription>By priority</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incidentsByService} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="p1" stackId="a" fill="var(--destructive)" />
                <Bar dataKey="p2" stackId="a" fill="var(--warning)" />
                <Bar dataKey="p3" stackId="a" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Recommendations
            </CardTitle>
            <CardDescription>Actions proposed by your agents — awaiting approval</CardDescription>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/approvals">
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approval Center
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recommendations.slice(0, 4).map((r) => (
            <Link
              key={r.id}
              to="/approvals"
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-accent/5"
            >
              <div className="mt-0.5"><SeverityBadge severity={r.severity} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug">{r.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.agent}</span><span>•</span>
                  <span className="text-success font-medium">{r.impact}</span>
                </div>
              </div>
              <span className="opacity-0 text-xs text-primary transition group-hover:opacity-100">Review →</span>
            </Link>
          ))}
        </CardContent>
      </Card>
      </>
      )}

      <KpiDrillSheet open={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

function KpiDrillSheet({ open, onClose }: { open: DrillKey | null; onClose: () => void }) {
  return (
    <Sheet open={!!open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{open}</SheetTitle>
          <SheetDescription>
            {open === "Active Incidents" && "All open incidents across connected services."}
            {open === "Security Alerts" && "Findings from the Security & Compliance agent."}
            {open === "Cost Savings (MTD)" && "Optimizations applied this month."}
            {open === "Platform Health" && "Signals contributing to your health score."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-2">
          {open === "Active Incidents" &&
            incidents.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3 hover:border-primary/40 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
                  <SeverityBadge severity={i.severity} />
                </div>
                <div className="mt-1 text-sm font-medium">{i.title}</div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{i.service} · {i.owner}</span>
                  <span className="capitalize">{i.status} · {i.opened}</span>
                </div>
              </div>
            ))}

          {open === "Security Alerts" &&
            securityAlerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 hover:border-primary/40 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                  <SeverityBadge severity={a.severity} />
                </div>
                <div className="mt-1 text-sm font-medium">{a.title}</div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{a.service}</span>
                  <span className="capitalize">{a.status} · {a.detected}</span>
                </div>
              </div>
            ))}

          {open === "Cost Savings (MTD)" &&
            recommendations
              .filter((r) => r.category === "Cost" || r.category === "License")
              .map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{r.agent}</span>
                    <span className="text-xs font-semibold text-success">{r.impact}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium">{r.title}</div>
                </div>
              ))}

          {open === "Platform Health" && (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              Health score aggregates uptime, error budget, and integration health across all connected systems. Drill into individual services from the Incidents view.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
