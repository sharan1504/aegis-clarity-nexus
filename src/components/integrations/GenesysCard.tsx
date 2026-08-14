// Real (non-mock) Genesys Cloud integration card. All Genesys traffic happens
// server-side; this component only calls server functions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_GENESYS_REGION,
  GENESYS_REGIONS,
  GENESYS_SCOPES,
} from "@/lib/genesys/errors";
import {
  disconnectGenesys,
  getGenesysIntegration,
  startGenesysOAuth,
  syncGenesysNow,
  verifyGenesysConnection,
} from "@/lib/integrations-genesys.functions";

function relative(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function GenesysCard() {
  const qc = useQueryClient();
  const load = useServerFn(getGenesysIntegration);
  const start = useServerFn(startGenesysOAuth);
  const verify = useServerFn(verifyGenesysConnection);
  const sync = useServerFn(syncGenesysNow);
  const disconnect = useServerFn(disconnectGenesys);

  const [region, setRegion] = useState<string>(DEFAULT_GENESYS_REGION);

  const { data, isLoading } = useQuery({
    queryKey: ["genesys-integration"],
    queryFn: () => load(),
  });

  const integration = data?.integration ?? null;
  const activeRegion = integration?.region ?? region;
  const connected = integration?.status === "connected";
  const canManage = data?.canManage ?? false;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["genesys-integration"] });

  const connectMutation = useMutation({
    mutationFn: () =>
      start({
        data: {
          region,
          redirectUri: `${window.location.origin}/integrations/genesys/callback`,
        },
      }),
    onSuccess: (res) => {
      if (res.ok && "authorizeUrl" in res) {
        window.location.href = res.authorizeUrl;
      } else {
        toast.error("Could not start Genesys authorization", {
          description: "errorMessage" in res ? res.errorMessage : undefined,
        });
      }
    },
    onError: () => toast.error("Could not start Genesys authorization"),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verify({}),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Connection healthy — ${res.orgName}`);
      else toast.error("Verification failed", { description: res.errorMessage });
      invalidate();
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (res) => {
      if (res.ok && "counts" in res && res.counts) {
        toast.success("Genesys sync completed", {
          description: `${res.counts.users} users · ${res.counts.licenses} license types · ${res.counts.userLicenses} user-license assignments · ${res.counts.queues} queues`,
        });
      } else {
        toast.error("Genesys sync failed", { description: res.errorMessage });
      }
      invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({}),
    onSuccess: (res) => {
      if (res.ok) toast.success("Genesys disconnected");
      else toast.error("Could not disconnect", { description: res.errorMessage });
      invalidate();
    },
  });

  const health = !connected
    ? { label: "Not connected", cls: "bg-muted text-muted-foreground border-border", icon: Plug }
    : integration?.healthStatus === "healthy"
      ? { label: "Connected · Healthy", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 }
      : {
          label: "Action required",
          cls: "bg-warning/20 text-warning-foreground border-warning ring-2 ring-warning/40",
          icon: AlertTriangle,
        };

  const busy =
    connectMutation.isPending ||
    verifyMutation.isPending ||
    syncMutation.isPending ||
    disconnectMutation.isPending;

  return (
    <Card className="border-primary/40 md:col-span-2 xl:col-span-1">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-2xl">
            🎧
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Genesys Cloud</CardTitle>
            <CardDescription>Contact Center · live integration</CardDescription>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${health.cls}`}
          >
            <health.icon className="h-3 w-3" /> {health.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading connection…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Read-only OAuth 2.0 sync of users, licenses, and queues into Aegis.
            </p>

            {!data?.configured && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Genesys OAuth client credentials are not saved yet. Add{" "}
                  <code>GENESYS_CLIENT_ID</code> and <code>GENESYS_CLIENT_SECRET</code> in backend
                  secrets to enable the connection.
                </span>
              </div>
            )}

            {connected && (
              <dl className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd className="font-medium text-foreground">
                    {integration?.externalOrgName ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Region</dt>
                  <dd className="font-medium text-foreground">{activeRegion}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd className="font-medium text-foreground">
                    {relative(integration?.lastSyncAt ?? null)}
                    {integration?.lastSyncStatus === "failed" && " (failed)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Records</dt>
                  <dd className="font-medium text-foreground">
                    {integration?.counts
                      ? `${integration.counts.users} users · ${integration.counts.licenses} license types · ${integration.counts.userLicenses} assignments · ${integration.counts.queues} queues`
                      : "—"}
                  </dd>
                </div>
              </dl>
            )}

            {integration?.healthDetail && (
              <p className="text-xs text-destructive">{integration.healthDetail}</p>
            )}

            {!connected && (
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Genesys region</span>
                <select
                  aria-label="Genesys region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {GENESYS_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.id}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              {GENESYS_SCOPES.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              {!connected ? (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!canManage || !data?.configured || busy}
                  onClick={() => connectMutation.mutate()}
                >
                  {connectMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                  )}
                  Connect with Genesys
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!canManage || busy}
                    onClick={() => syncMutation.mutate()}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                    )}
                    Sync now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage || busy}
                    onClick={() => verifyMutation.mutate()}
                  >
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canManage || busy}
                    onClick={() => disconnectMutation.mutate()}
                  >
                    Disconnect
                  </Button>
                </>
              )}
            </div>

            {!canManage && (
              <p className="text-[11px] text-muted-foreground">
                Admin or Manager role required to manage this integration.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
