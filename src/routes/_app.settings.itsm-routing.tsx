import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";

export const Route = createFileRoute("/_app/settings/itsm-routing")({ component: ItsmRoutingPage });

type Integration = { id: string; provider: string; display_name: string | null };
type Config = { id: string; integration_id: string; provider: string; target_config: Record<string, string>; issue_type: string | null; notification_emails: string[]; is_default: boolean; automatic_trigger_enabled: boolean };

function ItsmRoutingPage() {
  const { tenantId } = useTenantContext();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [target, setTarget] = useState("");
  const [issueType, setIssueType] = useState("Task");
  const [emails, setEmails] = useState("");
  const [automatic, setAutomatic] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => { if (!tenantId) return; const [i, c] = await Promise.all([supabase.from("integrations").select("id,provider,display_name").eq("tenant_id", tenantId).in("provider", ["jira", "servicenow"]).eq("status", "connected").eq("is_mock", false), (supabase as any).from("itsm_routing_config").select("id,integration_id,provider,target_config,issue_type,notification_emails,is_default,automatic_trigger_enabled").eq("tenant_id", tenantId)]); setIntegrations((i.data ?? []) as Integration[]); setConfigs((c.data ?? []) as Config[]); };
  useEffect(() => { void load(); }, [tenantId]);
  useEffect(() => { const c = selected && configs.find((x) => x.integration_id === selected.id); setTarget(c?.target_config?.projectKey ?? c?.target_config?.assignmentGroup ?? ""); setIssueType(c?.issue_type ?? "Task"); setEmails((c?.notification_emails ?? []).join(", ")); setAutomatic(Boolean(c?.automatic_trigger_enabled)); }, [selected, configs]);
  const save = async () => { if (!tenantId || !selected || !target.trim()) return; setSaving(true); const old = configs.find((x) => x.integration_id === selected.id); if (old?.is_default === false) { await (supabase as any).from("itsm_routing_config").update({ is_default: false }).eq("tenant_id", tenantId).eq("provider", selected.provider); } const payload = { tenant_id: tenantId, integration_id: selected.id, provider: selected.provider, target_config: selected.provider === "jira" ? { projectKey: target.trim() } : { assignmentGroup: target.trim() }, issue_type: selected.provider === "jira" ? issueType.trim() : null, default_priority_mapping: { Critical: "1", High: "2", Medium: "3", Low: "4" }, notification_emails: emails.split(",").map((e) => e.trim()).filter(Boolean), is_default: true, automatic_trigger_enabled: automatic, automatic_trigger_stage: automatic ? "Team Approvals" : null, automatic_trigger_severity: automatic ? "Critical" : null }; const result = old ? await (supabase as any).from("itsm_routing_config").update(payload).eq("id", old.id).eq("tenant_id", tenantId) : await (supabase as any).from("itsm_routing_config").insert(payload); setSaving(false); if (result.error) return; await load(); };

  return <div className="space-y-5"><PageHeader title="ITSM Routing" description="Explicitly route Approval Center tickets to a real connected Jira project or ServiceNow assignment group. No arbitrary destination fallback is allowed." actions={<Button variant="outline" asChild><Link to="/settings">Back to Settings</Link></Button>} /><Card><CardHeader><CardTitle className="text-sm">Connected ITSM systems</CardTitle><CardDescription>Only connected non-mock integrations are eligible.</CardDescription></CardHeader><CardContent>{integrations.length ? <div className="grid gap-2 md:grid-cols-2">{integrations.map((i) => <button key={i.id} type="button" onClick={() => setSelected(i)} className={`rounded-lg border p-3 text-left ${selected?.id === i.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center justify-between"><span className="text-sm font-medium">{i.display_name ?? i.provider}</span><Badge variant="outline">{i.provider}</Badge></div></button>)}</div> : <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No real Jira or ServiceNow connection is available. Connect one first.</div>}</CardContent></Card>{selected && <Card><CardHeader><CardTitle className="text-sm">Routing configuration</CardTitle><CardDescription>Save the real provider destination used by external ticket creation. Automatic ticket creation is disabled by default.</CardDescription></CardHeader><CardContent className="space-y-4"><div><label className="text-xs font-medium">{selected.provider === "jira" ? "Jira project key" : "ServiceNow assignment group"}</label><Input className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={selected.provider === "jira" ? "OPS" : "Assignment group"} /></div>{selected.provider === "jira" && <div><label className="text-xs font-medium">Issue type</label><Input className="mt-1" value={issueType} onChange={(e) => setIssueType(e.target.value)} /></div>}<div><label className="text-xs font-medium">Notification recipients</label><Input className="mt-1" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="user@example.com, team@example.com" /></div><div className="flex items-center justify-between rounded-md border p-3"><div><div className="text-sm font-medium">Automatic trigger</div><div className="text-xs text-muted-foreground">Create a ticket at Team Approvals when risk is Critical. Approval gating remains unchanged.</div></div><Switch checked={automatic} onCheckedChange={setAutomatic} /></div><Button disabled={saving || !target.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save routing"}</Button></CardContent></Card>}</div>;
}
