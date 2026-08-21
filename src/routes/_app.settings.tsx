import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
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
import { useTheme } from "@/lib/theme";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/lib/settings.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/settings")({ head: () => pageHead({ path: "/settings", title: "Workspace Settings — Aegis AI", description: "Manage organization, security, appearance, AI safety and workspace preferences." }), component: SettingsPage });

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const load = useServerFn(getWorkspaceSettings);
  const save = useServerFn(updateWorkspaceSettings);
  const [org, setOrg] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [timezones, setTimezones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masking, setMasking] = useState(true);
  useEffect(() => { void load().then((r) => { setOrg(r.organizationName); setDomain(r.primaryDomain); setTimezone(r.timezone); setTimezones(r.timezones); setMasking(Boolean((r.analyticsSettings as any).dataMasking ?? true)); }).catch((e) => toast.error("Settings could not be loaded", { description: e instanceof Error ? e.message : "Try again." })).finally(() => setLoading(false)); }, []);
  const submit = async () => { setSaving(true); try { await save({ data: { organizationName: org, primaryDomain: domain, timezone, analyticsSettings: { dataMasking: masking } } }); toast.success("Workspace settings saved"); } catch (e) { toast.error("Could not save workspace settings", { description: e instanceof Error ? e.message : "Try again." }); } finally { setSaving(false); } };
  return <div><PageHeader title="Settings" description="Persistent workspace configuration. Changes are stored against your tenant." />{loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading workspace settings…</div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle className="text-base">Organization</CardTitle><CardDescription>These values are used across the platform.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="Organization name"><Input value={org} onChange={(e) => setOrg(e.target.value)} /></Field><Field label="Primary domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" /></Field><Field label="Default timezone"><Select value={timezone} onValueChange={setTimezone}><SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger><SelectContent className="max-h-80">{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select></Field><div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{saving ? "Saving…" : "Save changes"}</Button></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Security & AI safety</CardTitle><CardDescription>Human-in-the-loop and data handling controls.</CardDescription></CardHeader><CardContent className="space-y-4"><Row label="Require approval for write actions" hint="Recommended for enterprise deployments"><Switch defaultChecked /></Row><Separator /><Row label="Auto-generate rollback plans" hint="Every change proposal should include rollback steps"><Switch defaultChecked /></Row><Separator /><Row label="Mask sensitive data in AI/analytics views" hint="Names, emails and identifiers are minimized"><Switch checked={masking} onCheckedChange={setMasking} /></Row><Separator /><Row label="Dark mode" hint={`Currently ${theme}`}><Switch checked={theme === "dark"} onCheckedChange={toggle} /></Row><div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-1 h-4 w-4" /> Write actions remain disabled when the connected provider exposes read-only capabilities.</div></CardContent></Card>
  </div>}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4"><div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>{children}</div>; }
