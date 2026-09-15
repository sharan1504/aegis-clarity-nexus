import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateProductivityReport, type ProductivityReport, type ProductivityWindow } from "@/lib/productivity.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/productivity")({
  head: () => pageHead({ path: "/productivity", title: "Productivity — CenOps", description: "Evidence-backed productivity reporting across connected enterprise providers." }),
  component: ProductivityPage,
});

const PROVIDERS = [
  ["jira", "Jira"],
  ["salesforce", "Salesforce"],
  ["servicenow", "ServiceNow"],
  ["genesys", "Genesys Cloud"],
  ["slack", "Slack"],
  ["github", "GitHub"],
] as const;
const WINDOWS: Array<[ProductivityWindow, string]> = [["week", "Current week"], ["month", "Current month"], ["3_months", "3 months"], ["6_months", "6 months"], ["year", "1 year"]];

function ProductivityPage() {
  const generate = useServerFn(generateProductivityReport);
  const [provider, setProvider] = useState("jira");
  const [user, setUser] = useState("");
  const [window, setWindow] = useState<ProductivityWindow>("month");
  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!user.trim()) return toast.error("Enter a user name or work email.");
    setBusy(true);
    try {
      const result = await generate({ data: { provider, user: user.trim(), window } });
      if (!result.ok) throw new Error(result.error);
      setReport(result.report);
      if (result.report.warnings.length) toast.info("Productivity data requires attention", { description: result.report.warnings[0] });
    } catch (error) {
      toast.error("Productivity report failed", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!report?.rows.length) return toast.info("There is no authorized report data to export.");
    const csv = ["Provider,Work Item,Title,Assignee,Status,Created,Updated,Completed,Project,URL", ...report.rows.map((row) => [row.provider, row.workItemId, row.title, row.assignee, row.status, row.createdAt ?? "", row.updatedAt ?? "", row.completedAt ?? "", row.project ?? "", row.url ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cenops-productivity-${provider}-${window}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div>
    <PageHeader title="Productivity" description="Evidence-backed work-item throughput and lifecycle reporting. No employee performance scores or judgments." actions={<Button variant="outline" size="sm" onClick={() => void run()} disabled={busy}><RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh report</Button>} />
    <Card className="mb-4">
      <CardHeader><CardTitle className="text-sm">Generate report</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2"><Label>Provider</Label><Select value={provider} onValueChange={setProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROVIDERS.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>User</Label><Input value={user} onChange={(event) => setUser(event.target.value)} placeholder="Name or work email" onKeyDown={(event) => { if (event.key === "Enter") void run(); }} /></div>
        <div className="space-y-2"><Label>Time window</Label><Select value={window} onValueChange={(value) => setWindow(value as ProductivityWindow)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WINDOWS.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end"><Button className="w-full" onClick={() => void run()} disabled={busy}>{busy ? "Generating…" : "Generate report"}</Button></div>
      </CardContent>
    </Card>

    {report && <>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[["Handled", report.totalHandled], ["Completed", report.completed], ["Open", report.open], ["Throughput / week", report.throughputPerWeek]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-sm">{report.provider} · {report.user}</CardTitle><div className="mt-1 text-xs text-muted-foreground">{new Date(report.from).toLocaleDateString()} → {new Date(report.to).toLocaleDateString()}</div></div><Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export visible data</Button></CardHeader>
        <CardContent>
          {report.averageCycleTimeHours !== null && <div className="mb-4 rounded-md border p-3 text-sm"><span className="text-muted-foreground">Average cycle time:</span> {report.averageCycleTimeHours} hours</div>}
          {report.warnings.length > 0 && <div className="mb-4 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">{report.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Read-only, tenant-scoped report. Cross-person reads are permission-checked and audited.</div>
          {report.rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-2">Work item</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Updated</th></tr></thead><tbody>{report.rows.map((row) => <tr key={`${row.provider}-${row.workItemId}`} className="border-b last:border-0"><td className="px-3 py-2 font-medium">{row.workItemId}</td><td className="px-3 py-2">{row.title}</td><td className="px-3 py-2"><Badge variant="outline">{row.status}</Badge></td><td className="px-3 py-2 text-xs text-muted-foreground">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div> : <div className="py-10 text-center text-sm text-muted-foreground">No authorized synchronized work-item evidence is available for this selection.</div>}
        </CardContent>
      </Card>
    </>}
  </div>;
}
