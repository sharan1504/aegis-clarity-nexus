import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Database, FileLock2, LockKeyhole, Save, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updatePrivacySettings } from "@/lib/organization-settings.functions";
import { getWorkspaceSettings } from "@/lib/settings.functions";

type PrivacySettings = {
  maskPii: boolean;
  allowAiProviderData: boolean;
  redactSecrets: boolean;
  aiActivityRetentionDays: number;
  retainExecutionEvidence: boolean;
  executionEvidenceRetentionDays: number;
};

const DEFAULTS: PrivacySettings = {
  maskPii: true,
  allowAiProviderData: true,
  redactSecrets: true,
  aiActivityRetentionDays: 90,
  retainExecutionEvidence: true,
  executionEvidenceRetentionDays: 90,
};

export function DataPrivacySettings() {
  const load = useServerFn(getWorkspaceSettings);
  const save = useServerFn(updatePrivacySettings);
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load()
      .then((workspace) => {
        const privacy = (workspace.analyticsSettings as Record<string, unknown> | undefined)?.privacy;
        const value = privacy && typeof privacy === "object" ? privacy as Record<string, unknown> : {};
        setSettings({
          maskPii: value.maskPii !== false,
          allowAiProviderData: value.allowAiProviderData !== false,
          redactSecrets: value.redactSecrets !== false,
          aiActivityRetentionDays: Number(value.aiActivityRetentionDays ?? 90),
          retainExecutionEvidence: value.retainExecutionEvidence !== false,
          executionEvidenceRetentionDays: Number(value.executionEvidenceRetentionDays ?? 90),
        });
      })
      .catch((e) => toast.error("Privacy settings could not be loaded", { description: e instanceof Error ? e.message : "Try again." }))
      .finally(() => setLoading(false));
  }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      await save({ data: settings });
      toast.success("Data privacy settings saved");
    } catch (e) {
      toast.error("Privacy settings could not be saved", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Privacy"
        description="Define the workspace data boundary for AI analysis, operational evidence, auditability and sensitive information."
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading privacy controls…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Workspace-wide policy. Division and group access boundaries still apply.</span>
            <Badge variant="outline" className="ml-auto">Admin controlled</Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><FileLock2 className="h-4 w-4" /> Data protection</CardTitle>
                <CardDescription>Reduce exposure of sensitive information across CenOps views and records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Row label="Mask PII in AI and analytics views" hint="Minimize names, email addresses and identifiers where masking is supported.">
                  <Switch checked={settings.maskPii} onCheckedChange={(checked) => setSettings((s) => ({ ...s, maskPii: checked }))} />
                </Row>
                <Separator />
                <Row label="Redact secrets from application-facing logs" hint="Prevent credentials, tokens and secret material from appearing in user-visible operational records.">
                  <Switch checked={settings.redactSecrets} onCheckedChange={(checked) => setSettings((s) => ({ ...s, redactSecrets: checked }))} />
                </Row>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> AI data boundary</CardTitle>
                <CardDescription>Explicitly control whether connected provider evidence can enter AI analysis paths.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Row label="Allow connected provider data in AI analysis" hint="When disabled, provider evidence must not be supplied to AI analysis capabilities.">
                  <Switch checked={settings.allowAiProviderData} onCheckedChange={(checked) => setSettings((s) => ({ ...s, allowAiProviderData: checked }))} />
                </Row>
                <Separator />
                <div className="space-y-2">
                  <Label>AI activity retention</Label>
                  <Input type="number" min={7} max={3650} value={settings.aiActivityRetentionDays} onChange={(e) => setSettings((s) => ({ ...s, aiActivityRetentionDays: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Target retention for AI activity and analysis records: 7–3650 days.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Execution evidence</CardTitle>
                <CardDescription>CenOps uses evidence and execution history to investigate, verify and audit agent activity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Row label="Retain execution evidence" hint="Keep agent investigation and execution evidence available for troubleshooting, verification and audit workflows.">
                  <Switch checked={settings.retainExecutionEvidence} onCheckedChange={(checked) => setSettings((s) => ({ ...s, retainExecutionEvidence: checked }))} />
                </Row>
                <Separator />
                <div className="space-y-2">
                  <Label>Execution evidence retention</Label>
                  <Input type="number" min={7} max={3650} disabled={!settings.retainExecutionEvidence} value={settings.executionEvidenceRetentionDays} onChange={(e) => setSettings((s) => ({ ...s, executionEvidenceRetentionDays: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Target retention for execution evidence: 7–3650 days.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-4 w-4" /> Governance boundary</CardTitle>
                <CardDescription>How this connects to CenOps access and change controls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Divisions</strong> are the primary data and capability boundary for workspace users.</p>
                <p><strong className="text-foreground">Groups</strong> organize users within a division and cannot expand that division's access.</p>
                <p><strong className="text-foreground">Provider evidence</strong> remains subject to the workspace AI data boundary and provider/connection access.</p>
                <p><strong className="text-foreground">Write actions</strong> remain subject to the existing approval, policy and verification lifecycle.</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={saving}>
              <Save className="mr-1.5 h-4 w-4" />{saving ? "Saving…" : "Save privacy settings"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}
