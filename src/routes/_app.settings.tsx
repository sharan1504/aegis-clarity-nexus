import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, Save, ShieldCheck, Trash2, Users, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { useTenantContext } from "@/lib/tenant";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/lib/settings.functions";
import { createWebhook, deleteWebhook, listWebhooks } from "@/lib/webhooks.functions";
import { getDepartmentAdminView, setDepartmentAgentAccess, setDepartmentProviderConnectionAccess, setUserDepartmentMemberships } from "@/lib/department-admin.functions";
import { pageHead } from "@/lib/seo";

type AnalyticsSettings = { dataMasking?: boolean };
type SecuritySettings = { requireApprovalForWrites: boolean; autoGenerateRollbackPlans: boolean };
type WebhookRecord = { id: string; target_url: string; event_types: string[]; enabled: boolean; created_at: string };
type DeliveryAttempt = { id: string; event_type: string; status_code: number | null; success: boolean; attempted_at: string };
type DepartmentAdminView = Awaited<ReturnType<typeof getDepartmentAdminView>>;

const DEFAULT_TIMEZONES = [
  "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai",
  "Australia/Sydney", "Pacific/Auckland", "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto",
  "America/Vancouver", "America/Sao_Paulo",
];

export const Route = createFileRoute("/_app/settings")({ head: () => pageHead({ path: "/settings", title: "Workspace Settings — Aegis AI", description: "Manage organization, security, appearance, AI safety and workspace preferences." }), component: SettingsPage });

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { refreshTenant } = useTenantContext();
  const load = useServerFn(getWorkspaceSettings);
  const save = useServerFn(updateWorkspaceSettings);
  const loadWebhooks = useServerFn(listWebhooks);
  const addWebhook = useServerFn(createWebhook);
  const removeWebhook = useServerFn(deleteWebhook);
  const loadDepartmentAdmin = useServerFn(getDepartmentAdminView);
  const updateUserDepartments = useServerFn(setUserDepartmentMemberships);
  const updateAgentAccess = useServerFn(setDepartmentAgentAccess);
  const updateConnectionAccess = useServerFn(setDepartmentProviderConnectionAccess);
  const [org, setOrg] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [timezones, setTimezones] = useState<string[]>(DEFAULT_TIMEZONES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masking, setMasking] = useState(true);
  const [requireApprovalForWrites, setRequireApprovalForWrites] = useState(true);
  const [autoGenerateRollbackPlans, setAutoGenerateRollbackPlans] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["change.approved", "change.rejected"]);
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [departmentAdmin, setDepartmentAdmin] = useState<DepartmentAdminView | null>(null);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

  const refreshWebhooks = async () => {
    try { const result = await loadWebhooks(); setWebhooks(result.webhooks); setAttempts(result.attempts); setEventTypes(result.eventTypes); } catch (e) { toast.error("Webhook settings could not be loaded", { description: e instanceof Error ? e.message : "Try again." }); }
  };

  const refreshDepartmentAdmin = async () => {
    setDepartmentLoading(true);
    try {
      const result = await loadDepartmentAdmin();
      setDepartmentAdmin(result);
      setSelectedDepartmentId((current) => current || result.departments[0]?.id || "");
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("Only workspace administrators"))) toast.error("Department access could not be loaded", { description: e instanceof Error ? e.message : "Try again." });
    } finally { setDepartmentLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const [settings] = await Promise.all([load(), refreshWebhooks()]);
        if (cancelled) return;
        setOrg(settings.organizationName);
        setDomain(settings.primaryDomain);
        setTimezone(settings.timezone || "UTC");
        setTimezones(settings.timezones?.length ? settings.timezones : DEFAULT_TIMEZONES);
        const analytics = settings.analyticsSettings as AnalyticsSettings;
        const security = settings.securitySettings as SecuritySettings;
        setMasking(Boolean(analytics.dataMasking ?? true));
        setRequireApprovalForWrites(security.requireApprovalForWrites);
        setAutoGenerateRollbackPlans(security.autoGenerateRollbackPlans);
        void refreshDepartmentAdmin();
      } catch (e) {
        if (!cancelled) toast.error("Settings could not be loaded", { description: e instanceof Error ? e.message : "Try again." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [load, loadWebhooks]);

  const submit = async () => {
    if (!org.trim()) { toast.error("Organization name is required"); return; }
    setSaving(true);
    try {
      await save({ data: { organizationName: org.trim(), primaryDomain: domain.trim(), timezone: timezone || "UTC", analyticsSettings: { dataMasking: masking }, securitySettings: { requireApprovalForWrites, autoGenerateRollbackPlans } } });
      const saved = await load();
      setOrg(saved.organizationName);
      setDomain(saved.primaryDomain);
      setTimezone(saved.timezone || "UTC");
      setTimezones(saved.timezones?.length ? saved.timezones : DEFAULT_TIMEZONES);
      await refreshTenant();
      toast.success("Workspace settings saved");
    } catch (e) {
      toast.error("Could not save workspace settings", { description: e instanceof Error ? e.message : "Try again." });
    } finally { setSaving(false); }
  };

  const create = async () => { setWebhookLoading(true); try { const result = await addWebhook({ data: { targetUrl: webhookUrl, eventTypes: webhookEvents } }); setWebhookUrl(""); toast.success("Webhook created", { description: `Save this signing secret now: ${result.secret}` }); await refreshWebhooks(); } catch (e) { toast.error("Webhook could not be created", { description: e instanceof Error ? e.message : "Try again." }); } finally { setWebhookLoading(false); } };
  const remove = async (id: string) => { try { await removeWebhook({ data: { id } }); await refreshWebhooks(); toast.success("Webhook deleted"); } catch (e) { toast.error("Webhook could not be deleted", { description: e instanceof Error ? e.message : "Try again." }); } };

  const toggleUserDepartment = async (userId: string, departmentId: string, checked: boolean) => {
    if (!departmentAdmin) return;
    const member = departmentAdmin.members.find((item) => item.id === userId);
    if (!member) return;
    const next = checked ? [...member.departmentIds, departmentId] : member.departmentIds.filter((id) => id !== departmentId);
    try { await updateUserDepartments({ data: { userId, departmentIds: next } }); setDepartmentAdmin((current) => current ? { ...current, members: current.members.map((item) => item.id === userId ? { ...item, departmentIds: next } : item) } : current); toast.success("Department access updated"); }
    catch (e) { toast.error("Department access could not be updated", { description: e instanceof Error ? e.message : "Try again." }); }
  };

  const toggleAgent = async (departmentId: string, agentKey: string, checked: boolean) => {
    if (!departmentAdmin) return;
    try {
      await updateAgentAccess({ data: { departmentId, agentKey, enabled: checked } });
      setDepartmentAdmin((current) => {
        if (!current) return current;
        const existing = current.access.find((item) => item.department_id === departmentId && item.agent_key === agentKey);
        const access = existing ? current.access.map((item) => item === existing ? { ...item, enabled: checked } : item) : [...current.access, { department_id: departmentId, agent_key: agentKey, enabled: checked }];
        return { ...current, access };
      });
    } catch (e) { toast.error("Agent access could not be updated", { description: e instanceof Error ? e.message : "Try again." }); }
  };

  const toggleConnection = async (departmentId: string, connectionId: string, checked: boolean) => {
    if (!departmentAdmin) return;
    try {
      await updateConnectionAccess({ data: { departmentId, connectionId, enabled: checked } });
      setDepartmentAdmin((current) => {
        if (!current) return current;
        const existing = current.connectionAccess.find((item) => item.department_id === departmentId && item.connection_id === connectionId);
        const connectionAccess = existing ? current.connectionAccess.map((item) => item === existing ? { ...item, enabled: checked } : item) : [...current.connectionAccess, { department_id: departmentId, connection_id: connectionId, enabled: checked }];
        return { ...current, connectionAccess };
      });
    } catch (e) { toast.error("Integration instance access could not be updated", { description: e instanceof Error ? e.message : "Try again." }); }
  };

  return <div><PageHeader title="Settings" description="Persistent workspace configuration. Changes are stored against your tenant." />{loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading workspace settings…</div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle className="text-base">Organization</CardTitle><CardDescription>These values are used across the platform.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="Organization name"><Input value={org} onChange={(e) => setOrg(e.target.value)} /></Field><Field label="Primary domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" /></Field><Field label="Default timezone"><Select value={timezone || "UTC"} onValueChange={setTimezone}><SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger><SelectContent className="max-h-80">{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select></Field><div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving || !org.trim()}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{saving ? "Saving…" : "Save changes"}</Button></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Security & AI safety</CardTitle><CardDescription>Human-in-the-loop and data handling controls.</CardDescription></CardHeader><CardContent className="space-y-4"><Row label="Require approval for write actions" hint="Persisted workspace control; disabling allows governed write operations to proceed only when the execution gate permits them"><Switch checked={requireApprovalForWrites} onCheckedChange={setRequireApprovalForWrites} /></Row><Separator /><Row label="Auto-generate rollback plans" hint="Persisted workspace control for new change proposals"><Switch checked={autoGenerateRollbackPlans} onCheckedChange={setAutoGenerateRollbackPlans} /></Row><Separator /><Row label="Mask sensitive data in AI/analytics views" hint="Names, emails and identifiers are minimized"><Switch checked={masking} onCheckedChange={setMasking} /></Row><Separator /><Row label="Dark mode" hint={`Currently ${theme}`}><Switch checked={theme === "dark"} onCheckedChange={toggle} /></Row><div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-1 h-4 w-4" /> These controls are tenant-scoped and persisted in workspace settings.</div></CardContent></Card>
    {departmentAdmin && <Card className="xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Department data isolation</CardTitle><CardDescription>Assign users, agents and specific integration instances to each department. Department scope is enforced server-side for AI and connected evidence.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-1 h-4 w-4" /> When a provider has multiple instances such as Production and UAT, department-scoped AI does not expose either instance until an administrator explicitly assigns the correct instance. This prevents cross-environment leakage.</div><div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> User department membership</div><div className="space-y-2">{departmentAdmin.members.map((member) => <div key={member.id} className="rounded-lg border p-3"><div className="truncate text-sm font-medium">{member.full_name || member.email || member.id}</div><div className="text-xs text-muted-foreground">{member.email} · {member.role}</div><div className="mt-2 flex flex-wrap gap-1.5">{departmentAdmin.departments.map((department) => <label key={department.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs"><input type="checkbox" checked={member.departmentIds.includes(department.id)} onChange={(event) => void toggleUserDepartment(member.id, department.id, event.target.checked)} />{department.display_name}</label>)}</div></div>)}</div></div><div><div className="mb-2 text-sm font-semibold">Department data sources</div><div className="mb-2 flex items-center gap-2"><Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}><SelectTrigger className="w-full"><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departmentAdmin.departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.display_name}</SelectItem>)}</SelectContent></Select></div>{selectedDepartmentId && <div className="space-y-4 rounded-lg border p-3"><div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agents</div><div className="space-y-2">{departmentAdmin.agents.map((agent) => { const enabled = departmentAdmin.access.some((item) => item.department_id === selectedDepartmentId && item.agent_key === agent.agent_key && item.enabled); return <Row key={agent.agent_key} label={agent.display_name || agent.agent_key} hint={agent.description ?? agent.category ?? agent.agent_key}><Switch checked={enabled} onCheckedChange={(checked) => void toggleAgent(selectedDepartmentId, agent.agent_key, checked)} /></Row>; })}</div></div><Separator /><div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Integration instances</div>{departmentAdmin.connections.length === 0 ? <div className="text-xs text-muted-foreground">No provider instances configured.</div> : <div className="space-y-2">{departmentAdmin.connections.map((connection) => { const enabled = departmentAdmin.connectionAccess.some((item) => item.department_id === selectedDepartmentId && item.connection_id === connection.id && item.enabled); return <Row key={connection.id} label={connection.display_name || connection.provider} hint={`${connection.provider} · ${connection.environment || "Production"} · ${connection.status}`}><Switch checked={enabled} onCheckedChange={(checked) => void toggleConnection(selectedDepartmentId, connection.id, checked)} /></Row>; })}</div>}</div></div>}</div></div></CardContent></Card>}
    {departmentLoading && !departmentAdmin && <Card className="xl:col-span-2"><CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading department access controls…</CardContent></Card>}
    <Card className="xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Webhook className="h-4 w-4" /> Outbound webhooks</CardTitle><CardDescription>Receive signed Aegis events asynchronously. Webhook failures never block the originating change or approval.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]"><Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-system.example/aegis/webhook" /><Button onClick={() => void create()} disabled={webhookLoading || !webhookUrl.trim() || webhookEvents.length === 0}>{webhookLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Webhook className="mr-1.5 h-4 w-4" />}Subscribe</Button></div>
      <div className="flex flex-wrap gap-2">{eventTypes.map((event) => <Button key={event} type="button" variant={webhookEvents.includes(event) ? "default" : "outline"} size="sm" onClick={() => setWebhookEvents((current) => current.includes(event) ? current.filter((x) => x !== event) : [...current, event])}>{event}</Button>)}</div>
      <div className="space-y-2">{webhooks.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No webhook subscriptions configured.</div> : webhooks.map((hook) => <div key={hook.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{hook.target_url}</div><div className="mt-1 flex flex-wrap gap-1">{hook.event_types.map((event) => <Badge key={event} variant="outline">{event}</Badge>)}</div></div><Button variant="ghost" size="icon" onClick={() => void remove(hook.id)} aria-label="Delete webhook"><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent delivery attempts</div>{attempts.length === 0 ? <div className="text-sm text-muted-foreground">No deliveries yet.</div> : <div className="space-y-2">{attempts.slice(0, 20).map((attempt) => <div key={attempt.id} className="flex items-center justify-between gap-3 rounded border p-2 text-xs"><span>{attempt.event_type}</span><span>{attempt.success ? `Delivered (${attempt.status_code})` : `Failed${attempt.status_code ? ` (${attempt.status_code})` : ""}`}</span><span className="text-muted-foreground">{new Date(attempt.attempted_at).toLocaleString()}</span></div>)}</div>}</div>
    </CardContent></Card>
  </div>}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4"><div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>{children}</div>; }