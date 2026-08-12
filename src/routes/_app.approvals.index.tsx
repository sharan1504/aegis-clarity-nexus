import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Filter,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SeverityBadge, StatusPill } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRole } from "@/lib/rbac";
import { useRealtime, updateRecords } from "@/lib/realtime";
import {
  changeRecords as seed,
  CHANGE_STAGES,
  approvalProgress,
  type ChangeRecord,
  type ChangeStage,
} from "@/lib/change-data";

interface ListSearch {
  stage: string;
  risk: string;
  mode: string;
  team: string;
  q: string;
  sort: SortKey;
  dir: "asc" | "desc";
}

type SortKey = "id" | "title" | "team" | "risk" | "stage" | "window";
const SORT_KEYS: SortKey[] = ["id", "title", "team", "risk", "stage", "window"];

export const Route = createFileRoute("/_app/approvals/")({
  validateSearch: (raw: Record<string, unknown>): ListSearch => ({
    stage: typeof raw.stage === "string" ? raw.stage : "all",
    risk: typeof raw.risk === "string" ? raw.risk : "all",
    mode: typeof raw.mode === "string" ? raw.mode : "all",
    team: typeof raw.team === "string" ? raw.team : "all",
    q: typeof raw.q === "string" ? raw.q : "",
    sort: SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : "id",
    dir: raw.dir === "desc" ? "desc" : "asc",
  }),
  component: ChangeListPage,
});

const stageTone: Record<ChangeStage, "neutral" | "info" | "warning" | "success"> = {
  Proposed: "neutral",
  "Owner Review": "info",
  "Change Created": "info",
  "Team Approvals": "warning",
  "Ready to Execute": "warning",
  Executed: "success",
};

function ChangeListPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { can, role } = useRole();
  const { records: items, connected, lastEventAt } = useRealtime();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "approve" | "reject">(null);

  const teams = useMemo(() => Array.from(new Set(seed.map((c) => c.ownerTeam))), []);

  const set = (k: keyof ListSearch, v: string) =>
    navigate({ search: (prev: ListSearch) => ({ ...prev, [k]: v }) });

  const filtered = useMemo(() => {
    const riskRank: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
    const matched = items.filter((c) => {
      if (search.stage !== "all" && c.stage !== search.stage) return false;
      if (search.risk !== "all" && c.risk.tier !== search.risk) return false;
      if (search.mode !== "all" && c.executionMode !== search.mode) return false;
      if (search.team !== "all" && c.ownerTeam !== search.team) return false;
      if (search.q) {
        const q = search.q.toLowerCase();
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.ownerTeam.toLowerCase().includes(q) ||
          c.agent.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const value = (c: ChangeRecord) => {
      switch (search.sort) {
        case "title":
          return c.title.toLowerCase();
        case "team":
          return c.ownerTeam.toLowerCase();
        case "risk":
          return riskRank[c.risk.tier] ?? -1;
        case "stage":
          return CHANGE_STAGES.indexOf(c.stage);
        case "window":
          return c.window.start;
        default:
          return c.id.toLowerCase();
      }
    };

    return [...matched].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return search.dir === "desc" ? -cmp : cmp;
    });
  }, [items, search]);

  const toggleSort = (key: SortKey) =>
    navigate({
      search: (prev: ListSearch) => ({
        ...prev,
        sort: key,
        dir: prev.sort === key && prev.dir === "asc" ? "desc" : "asc",
      }),
    });

  const SortHead = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => {
    const active = search.sort === sortKey;
    const Icon = !active ? ChevronsUpDown : search.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
          aria-label={`Sort by ${label}`}
        >
          {label}
          <Icon className="h-3 w-3 opacity-70" />
        </button>
      </TableHead>
    );
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const doBulk = async (action: "approve" | "reject") => {
    const ids = Array.from(selected);
    const records = items.filter((x) => ids.includes(x.id));
    if (!tenantId) {
      toast.error("Workspace not ready", { description: "Try again in a moment." });
      return;
    }
    setBusy(true);
    try {
      await bulkDecideChanges(records, action === "approve" ? "approved" : "rejected", {
        tenantId,
        actor: user?.email ?? "unknown",
        role,
      });
      setSelected(new Set());
      setBulk(null);
      if (action === "approve") {
        toast.success(`Approved ${ids.length} change record${ids.length > 1 ? "s" : ""}`, {
          description: "Immutable audit entries written. Downstream teams notified.",
        });
      } else {
        toast.error(`Rejected ${ids.length} change record${ids.length > 1 ? "s" : ""}`, {
          description: "Rejection recorded in the audit log with your identity as reviewer.",
        });
      }
    } catch (err) {
      toast.error("Bulk action failed", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div>
      <PageHeader
        title="Change Control Center"
        description="Aegis orchestrates enterprise change proposals. All approval authority remains with your teams and existing ITSM system of record."
        actions={
          <Badge variant="outline" className="hidden gap-1.5 md:inline-flex">
            <ShieldCheck className="h-3 w-3" /> Reviewing as {role}
          </Badge>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <input
            value={search.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search CHG ID, title, owner team, agent…"
            className="h-8 w-[240px] rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary"
          />
          <FilterSelect label="Stage" value={search.stage} onChange={(v) => set("stage", v)} options={["all", ...CHANGE_STAGES]} />
          <FilterSelect label="Risk" value={search.risk} onChange={(v) => set("risk", v)} options={["all", "Low", "Medium", "High", "Critical"]} />
          <FilterSelect label="Mode" value={search.mode} onChange={(v) => set("mode", v)} options={["all", "Manual", "Assisted", "Automatic"]} />
          <FilterSelect label="Team" value={search.team} onChange={(v) => set("team", v)} options={["all", ...teams]} />
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-success" : "bg-muted-foreground/50"}`} />
              {connected ? "Live" : "Offline"}
              {lastEventAt && (
                <span className="font-mono text-[10px] opacity-70">
                  · updated {new Date(lastEventAt).toLocaleTimeString()}
                </span>
              )}
            </span>
            <span>
              {filtered.length} of {items.length} records
            </span>
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card className="mb-3 border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="text-sm font-medium">
              {selected.size} record{selected.size > 1 ? "s" : ""} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!can("approvals.reject")}
                onClick={() => setBulk("reject")}
              >
                <X className="mr-1.5 h-4 w-4" /> Reject selected
              </Button>
              <Button size="sm" disabled={!can("approvals.approve")} onClick={() => setBulk("approve")}>
                <Check className="mr-1.5 h-4 w-4" /> Approve selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <SortHead label="Change ID" sortKey="id" className="min-w-[130px]" />
                <SortHead label="Title" sortKey="title" />
                <SortHead label="Stage" sortKey="stage" />
                <SortHead label="Risk" sortKey="risk" />
                <TableHead>Mode</TableHead>
                <SortHead label="Window" sortKey="window" />
                <SortHead label="Owner team" sortKey="team" />
                <TableHead>Approvals</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const p = approvalProgress(c);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-stop]")) return;
                      navigate({ to: "/approvals/$id", params: { id: c.id } });
                    }}
                  >
                    <TableCell data-stop onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Select ${c.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/90">{c.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={c.severity} />
                        <span className="max-w-[360px] truncate text-sm font-medium">{c.title}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Proposed by {c.agent}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={stageTone[c.stage]}>{c.stage}</StatusPill>
                    </TableCell>
                    <TableCell>
                      <RiskChip tier={c.risk.tier} score={c.risk.score} />
                    </TableCell>
                    <TableCell>
                      <ModeChip mode={c.executionMode} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {c.window.start.slice(5, 16)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.ownerTeam}</TableCell>
                    <TableCell>
                      <ApprovalMini done={p.done} total={p.total} />
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-14 text-center text-sm text-muted-foreground">
                    No change records match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Aegis proposes and tracks; your ITSM system of record retains authority. All approvals are cryptographically signed and logged to the audit trail.
      </div>

      <Dialog open={!!bulk} onOpenChange={(v) => !v && setBulk(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulk === "approve" ? (
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              )}
              Confirm bulk {bulk}
            </DialogTitle>
            <DialogDescription>
              You are about to {bulk} {selected.size} change record{selected.size > 1 ? "s" : ""} as{" "}
              <span className="font-semibold text-foreground">{role}</span>. Each record's rollback plan remains available for its defined window.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
            {Array.from(selected).map((id) => {
              const c = items.find((x) => x.id === id);
              if (!c) return null;
              return (
                <div key={id} className="text-xs">
                  <div className="font-mono text-foreground/90">{c.id}</div>
                  <div className="mt-0.5 text-foreground">{c.title}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    Rollback: {c.rollbackSteps[0]}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulk(null)}>
              Cancel
            </Button>
            <Button
              variant={bulk === "reject" ? "destructive" : "default"}
              onClick={() => bulk && doBulk(bulk)}
            >
              Confirm {bulk}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs capitalize">
              {o === "all" ? `All ${label.toLowerCase()}s` : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RiskChip({ tier, score }: { tier: string; score?: number }) {
  const tone =
    tier === "Critical"
      ? "bg-destructive text-destructive-foreground border-destructive"
      : tier === "High"
        ? "bg-destructive/15 text-destructive border-destructive/40"
        : tier === "Medium"
          ? "bg-warning/20 text-warning-foreground border-warning/50"
          : "bg-success/15 text-success border-success/30";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {tier}
      {typeof score === "number" && <span className="font-mono opacity-70">· {score}</span>}
    </span>
  );
}

export function ModeChip({ mode }: { mode: string }) {
  const tone =
    mode === "Automatic"
      ? "bg-primary/15 text-primary border-primary/40"
      : mode === "Assisted"
        ? "bg-info/15 text-info border-info/40"
        : "bg-muted text-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {mode}
    </span>
  );
}

function ApprovalMini({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {done} of {total}
      </span>
    </div>
  );
}
