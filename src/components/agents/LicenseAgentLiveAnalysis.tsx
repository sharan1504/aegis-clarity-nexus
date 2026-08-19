import { useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { executeLicenseAgent } from "@/lib/agents/license/functions";
import { executeLicenseOptimization } from "@/lib/agents/license/optimization";
import type { LicenseResultMeta, LicenseSummary, UnusedLicenseCandidates } from "@/lib/agents/license/types";
import type { LicenseOptimizationAnalysis } from "@/lib/agents/license/optimization";

type Success<T> = { ok: true; data: T; meta: LicenseResultMeta };

export function LicenseAgentLiveAnalysis() {
  const execute = useServerFn(executeLicenseAgent);
  const runOptimization = useServerFn(executeLicenseOptimization);
  const [summary, setSummary] = useState<Success<LicenseSummary> | null>(null);
  const [candidates, setCandidates] = useState<Success<UnusedLicenseCandidates> | null>(null);
  const [optimization, setOptimization] = useState<LicenseOptimizationAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const [summaryResult, candidateResult, optimizationResult] = await Promise.all([
        execute({ data: { operation: "get_license_summary" } }),
        execute({ data: { operation: "get_unused_license_candidates" } }),
        runOptimization(),
      ]);
      return { summaryResult, candidateResult, optimizationResult };
    },
    onMutate: () => {
      setError(null);
      setSummary(null);
      setCandidates(null);
      setOptimization(null);
    },
    onSuccess: ({ summaryResult, candidateResult, optimizationResult }) => {
      if (!summaryResult.ok) {
        setError(summaryResult.error.message);
        return;
      }
      if (!candidateResult.ok) {
        setError(candidateResult.error.message);
        return;
      }
      setSummary(summaryResult as Success<LicenseSummary>);
      setCandidates(candidateResult as Success<UnusedLicenseCandidates>);
      setOptimization(optimizationResult);
    },
    onError: () => setError("The live License Agent analysis could not be completed."),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Live License Analysis</div>
          <p className="text-xs text-muted-foreground">
            Read-only analysis of connected license data. Recommendations are evidence-driven and never perform license changes.
          </p>
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Analyze live data</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              Live license inventory
              <Badge variant="outline" className="text-[10px]">read only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="Users" value={String(summary.data.totalUsers)} />
              <Metric label="Assignments" value={String(summary.data.totalAssignments)} />
              <Metric label="License types" value={String(summary.data.totalLicenseTypes)} />
              <Metric label="Multi-license users" value={String(summary.data.usersWithMultipleLicenseCount)} />
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Evaluated {new Date(summary.meta.evaluatedAt).toLocaleString()} · Freshness: {summary.meta.freshness} · Sources: {summary.meta.sources.length}
            </div>
          </CardContent>
        </Card>
      )}

      {optimization && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Evidence-driven optimization</CardTitle>
            <p className="text-xs text-muted-foreground">
              The agent identifies review opportunities from available evidence. It does not assume a specific inactivity period or invent missing facts.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {optimization.insights.length === 0 ? (
              <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                No evidence-backed optimization opportunity was identified from the current connected data.
              </div>
            ) : (
              optimization.insights.map((insight) => (
                <div key={`${insight.kind}:${insight.title}`} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">{insight.title}</div>
                    <Badge variant="outline" className="text-[10px]">{insight.confidence} confidence</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{insight.statement}</div>
                  <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground">
                    {insight.evidence.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))
            )}
            {optimization.limitations.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-[11px] font-medium">Data limitations</div>
                <ul className="mt-1 list-disc pl-4 text-[11px] text-muted-foreground">
                  {optimization.limitations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {candidates && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Policy-based candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="Recommendations" value={String(candidates.data.recommendations.length)} />
              <Metric label="Inconclusive" value={String(candidates.data.inconclusive.length)} />
              <Metric label="Evaluated" value={String(candidates.data.evaluatedAssignments)} />
              <Metric label="Excluded" value={String(candidates.data.excludedCount)} />
            </div>
            {candidates.data.recommendations.length > 0 && (
              <div className="mt-3 space-y-2">
                {candidates.data.recommendations.slice(0, 10).map((r) => (
                  <div key={`${r.userId}:${r.licenseId}`} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium">{r.user ?? r.email ?? r.userId}</div>
                      <Badge variant="outline" className="text-[10px]">{r.risk}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.license ?? r.licenseId} · inactive {r.inactivityDays} days · confidence {r.confidence}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
