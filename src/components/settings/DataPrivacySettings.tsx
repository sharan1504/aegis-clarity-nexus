import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePrivacySettings } from "@/lib/organization-settings.functions";
import { getWorkspaceSettings } from "@/lib/settings.functions";

export function DataPrivacySettings() {
  const load = useServerFn(getWorkspaceSettings);
  const save = useServerFn(updatePrivacySettings);
  const [maskPii, setMaskPii] = useState(true);
  const [allowAiProviderData, setAllowAiProviderData] = useState(true);
  const [redactSecrets, setRedactSecrets] = useState(true);
  const [retention, setRetention] = useState(90);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void load().then((settings) => { const privacy = (settings.analyticsSettings as any)?.privacy ?? {}; setMaskPii(privacy.maskPii !== false); setAllowAiProviderData(privacy.allowAiProviderData !== false); setRedactSecrets(privacy.redactSecrets !== false); setRetention(Number(privacy.aiActivityRetentionDays ?? 90)); }).catch((e) => toast.error("Privacy settings could not be loaded", { description: e instanceof Error ? e.message : "Try again." })).finally(() => setLoading(false)); }, [load]);
  const submit = async () => { try { await save({ data: { maskPii, allowAiProviderData, redactSecrets, aiActivityRetentionDays: retention } }); toast.success("Data privacy settings saved"); } catch (e) { toast.error("Privacy settings could not be saved", { description: e instanceof Error ? e.message : "Try again." }); } };
  return <div className="space-y-5"><PageHeader title="Data Privacy" description="Control how workspace data is masked, processed by AI, and retained." />{loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading privacy controls…</div> : <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-4 w-4" /> Data handling</CardTitle><CardDescription>These controls apply to the workspace.</CardDescription></CardHeader><CardContent className="space-y-4"><Row label="Mask PII in AI and analytics views" hint="Minimize names, email addresses and identifiers where masking is supported."><Switch checked={maskPii} onCheckedChange={setMaskPii} /></Row><Row label="Allow connected provider data in AI analysis" hint="When disabled, provider evidence should not be supplied to AI analysis paths."><Switch checked={allowAiProviderData} onCheckedChange={setAllowAiProviderData} /></Row><Row label="Redact secrets from application-facing logs" hint="Keep credential values, tokens and secret material out of user-visible operational records."><Switch checked={redactSecrets} onCheckedChange={setRedactSecrets} /></Row><div className="space-y-2"><Label>AI activity retention (days)</Label><Input type="number" min={7} max={3650} value={retention} onChange={(e) => setRetention(Number(e.target.value))} /><p className="text-xs text-muted-foreground">Between 7 and 3650 days.</p></div><Button onClick={() => void submit()}><Save className="mr-1.5 h-4 w-4" /> Save privacy settings</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Governance & safety</CardTitle><CardDescription>Controls that complement the existing approval and safety model.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Division access is a security boundary. Groups cannot grant access outside their division.</p><p>AI provider data access is explicit and tenant-scoped.</p><p>Write actions remain subject to the existing governance and approval controls.</p><p>Secrets are stored server-side; never place credentials or API keys in chat, documentation or browser-visible settings.</p></CardContent></Card></div>}</div>;
}
function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><div className="text-sm font-medium">{label}</div><div className="mt-0.5 text-xs text-muted-foreground">{hint}</div></div>{children}</div>; }
