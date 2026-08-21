import { useEffect, useState } from "react";
import { CheckCircle2, Plug, Loader2, ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GenesysCard } from "@/components/integrations/GenesysCard";
import { pageHead } from "@/lib/seo";
import { connectProvider, getProviderCatalog } from "@/lib/integrations/provider-functions";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations — Aegis AI", description: "Connect enterprise systems using real provider authentication and synchronized data." }),
  component: IntegrationsPage,
});

type Provider = Awaited<ReturnType<typeof getProviderCatalog>>["providers"][number];
type FormState = { tenant: string; clientId: string; clientSecret: string; accessToken: string; apiToken: string; baseUrl: string; region: string; accessKeyId: string; secretAccessKey: string; sessionToken: string };
const EMPTY: FormState = { tenant: "", clientId: "", clientSecret: "", accessToken: "", apiToken: "", baseUrl: "", region: "", accessKeyId: "", secretAccessKey: "", sessionToken: "" };

function statusUi(configured: boolean) {
  return configured ? { label: "Connected", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 } : { label: "Not connected", cls: "bg-muted text-muted-foreground border-border", icon: Plug };
}

function fieldNeeded(provider: Provider, field: keyof FormState) {
  if (["m365", "azure"].includes(provider.id)) return ["tenant", "clientId", "clientSecret"].includes(field);
  if (provider.id === "aws") return ["accessKeyId", "secretAccessKey", "sessionToken", "region"].includes(field);
  if (["servicenow", "salesforce"].includes(provider.id)) return ["accessToken", "baseUrl"].includes(field);
  return field === "accessToken";
}

function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [target, setTarget] = useState<Provider | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => getProviderCatalog().then((r) => setProviders(r.providers)).catch(() => setMessage("Unable to load provider catalog."));
  useEffect(() => { void load(); }, []);

  const connect = async () => {
    if (!target) return;
    setBusy(true); setMessage(null);
    try {
      const result = await connectProvider({ data: { provider: target.id, tenant: form.tenant, clientId: form.clientId, clientSecret: form.clientSecret, accessToken: form.accessToken, apiToken: form.apiToken, baseUrl: form.baseUrl, region: form.region, accessKeyId: form.accessKeyId, secretAccessKey: form.secretAccessKey, sessionToken: form.sessionToken } });
      if (result.ok) { setTarget(null); setForm(EMPTY); await load(); }
      else setMessage(result.error ?? "Provider connection failed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provider connection failed."); }
    finally { setBusy(false); }
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [key]: e.target.value }));

  return (
    <div>
      <PageHeader title="Integrations" description="Connections are verified against the real provider before Aegis marks them connected." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GenesysCard />
        {providers.filter((p) => p.id !== "genesys").map((provider) => {
          const status = statusUi(provider.configured);
          return <Card key={provider.id}><CardHeader><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-xl">{provider.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><CardTitle className="text-base">{provider.name}</CardTitle><CardDescription>{provider.category}</CardDescription></div><Badge variant="outline" className={status.cls}><status.icon className="mr-1 h-3 w-3" />{status.label}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{provider.description}</p><div className="text-xs text-muted-foreground">Auth: {provider.auth}</div><Button size="sm" className="w-full" onClick={() => { setTarget(provider); setForm(EMPTY); setMessage(null); }}>{provider.configured ? "Reconfigure" : "Configure"}</Button></CardContent></Card>;
        })}
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}><DialogContent className="sm:max-w-lg">{target && <><DialogHeader><DialogTitle>Connect {target.name}</DialogTitle><DialogDescription>Credentials are submitted only to the server. Aegis performs a real provider health check before saving the encrypted connection.</DialogDescription></DialogHeader><div className="space-y-3 py-2">
        {target.id === "aws" ? <>
          <Input placeholder="AWS access key ID" value={form.accessKeyId} onChange={set("accessKeyId")} autoComplete="off" />
          <Input type="password" placeholder="AWS secret access key" value={form.secretAccessKey} onChange={set("secretAccessKey")} autoComplete="new-password" />
          <Input type="password" placeholder="AWS session token (optional for temporary credentials)" value={form.sessionToken} onChange={set("sessionToken")} autoComplete="off" />
          <Input placeholder="AWS region (e.g. us-east-1)" value={form.region} onChange={set("region")} />
          <p className="text-xs text-muted-foreground">Use a dedicated IAM role/user with only the read permissions required by the Aegis AWS agent. Do not use root credentials.</p>
        </> : <>
          {fieldNeeded(target, "tenant") && <Input placeholder="Tenant ID" value={form.tenant} onChange={set("tenant")} />}
          {fieldNeeded(target, "clientId") && <Input placeholder="Client ID" value={form.clientId} onChange={set("clientId")} />}
          {fieldNeeded(target, "clientSecret") && <Input type="password" placeholder="Client secret" value={form.clientSecret} onChange={set("clientSecret")} />}
          {fieldNeeded(target, "baseUrl") && <Input placeholder={target.id === "servicenow" ? "https://your-instance.service-now.com" : "https://your-instance.my.salesforce.com"} value={form.baseUrl} onChange={set("baseUrl")} />}
          {fieldNeeded(target, "accessToken") && <Input type="password" placeholder="Provider access token" value={form.accessToken} onChange={set("accessToken")} />}
        </>}
        <div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Secrets are sent to the server for validation and encrypted before persistence.</div>
        {message && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{message}</div>}
      </div><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={connect} disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{busy ? "Validating…" : "Connect & verify"}</Button></DialogFooter></>}</DialogContent></Dialog>
    </div>
  );
}
