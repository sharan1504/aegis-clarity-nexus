import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATA_SOURCE_STATE_LABELS,
  providerLabel,
  type DataSourceState,
} from "@/lib/capabilities/registry";
import {
  addAgentDataSource,
  getAgentDataSources,
  previewAgentCapability,
  removeAgentDataSource,
  saveAgentInstructions,
  updateAgentDataSource,
} from "@/lib/agent-architecture.functions";

function StatePill({ state }: { state: DataSourceState }) {
  const map: Record<DataSourceState, string> = {
    active: "bg-success/15 text-success border-success/30",
    connected_not_bound: "bg-muted text-muted-foreground border-border",
    unhealthy: "bg-destructive/15 text-destructive border-destructive/30",
    stale: "bg-warning/20 text-warning-foreground border-warning/40",
    capability_unavailable: "bg-muted text-muted-foreground border-border",
    not_connected: "bg-muted text-muted-foreground border-border",
  };
  const Icon =
    state === "active" ? CheckCircle2 : state === "connected_not_bound" ? Plug : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${map[state]}`}
    >
      <Icon className="h-3 w-3" /> {DATA_SOURCE_STATE_LABELS[state]}
    </span>
  );
}

export function AgentDataSourceManager({
  agentKey,
  agentName,
}: {
  agentKey: string;
  agentName: string;
}) {
  const queryClient = useQueryClient();
  const fetchSources = useServerFn(getAgentDataSources);
  const addSource = useServerFn(addAgentDataSource);
  const updateSource = useServerFn(updateAgentDataSource);
  const removeSource = useServerFn(removeAgentDataSource);
  const saveInstructions = useServerFn(saveAgentInstructions);
  const preview = useServerFn(previewAgentCapability);

  const queryKey = ["agent-data-sources", agentKey];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchSources({ data: { agentKey } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const canManage = data?.canManage ?? false;

  const [pick, setPick] = useState<string>("");
  const [instr, setInstr] = useState({ pre: "", system: "", post: "" });

  useEffect(() => {
    if (data?.settings) {
      setInstr({
        pre: data.settings.preInstructions,
        system: data.settings.systemInstructions,
        post: data.settings.postInstructions,
      });
    }
  }, [data?.settings]);

  const addMutation = useMutation({
    mutationFn: (vars: { integrationId: string; capabilityKey: string }) =>
      addSource({ data: { agentKey, ...vars } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Data source connected to agent");
        setPick("");
        void invalidate();
      } else toast.error(res.errorMessage);
    },
    onError: () => toast.error("The data source could not be saved."),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { bindingId: string; enabled: boolean }) => updateSource({ data: vars }),
    onSuccess: (res) => {
      if (res.ok) void invalidate();
      else toast.error(res.errorMessage);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (bindingId: string) => removeSource({ data: { bindingId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Data source removed from agent");
        void invalidate();
      } else toast.error(res.errorMessage);
    },
  });

  const instrMutation = useMutation({
    mutationFn: () =>
      saveInstructions({
        data: {
          agentKey,
          preInstructions: instr.pre,
          systemInstructions: instr.system,
          postInstructions: instr.post,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Instructions saved");
        void invalidate();
      } else toast.error(res.errorMessage);
    },
  });

  const previewMutation = useMutation({
    mutationFn: (capabilityKey: string) => preview({ data: { agentKey, capabilityKey } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.errorMessage);
      toast.success(
        `${res.recordCount} normalized records from ${res.sources.length} source${res.sources.length === 1 ? "" : "s"}`,
        { description: res.warnings[0] ?? "Read-only capability call — no changes were made." },
      );
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (data && !data.ok) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {data.errorMessage}
      </div>
    );
  }

  const integrations = data?.integrations ?? [];
  const bindings = data?.bindings ?? [];
  const capabilities = data?.agentCapabilities ?? [];

  // Options are (integration × capability) pairs that both the agent and the
  // provider support and that are not already bound.
  const options = integrations.flatMap((i) =>
    i.compatibleCapabilities
      .filter((c) => !c.bound)
      .map((c) => ({
        value: `${i.integrationId}::${c.key}`,
        label: `${providerLabel(i.provider).name} → ${c.displayName}`,
        implemented: c.implemented,
      })),
  );

  return (
    <Tabs defaultValue="sources">
      <TabsList className="w-full">
        <TabsTrigger value="sources" className="flex-1">
          Data Sources
        </TabsTrigger>
        <TabsTrigger value="capabilities" className="flex-1">
          Capabilities
        </TabsTrigger>
        <TabsTrigger value="instructions" className="flex-1">
          Instructions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sources" className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {agentName} only reads from the sources enabled below. Adding a source never grants new
          permissions — the connector's own read-only scopes still apply.
        </p>

        {canManage && (
          <div className="flex gap-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="flex-1" aria-label="Select a data source to add">
                <SelectValue
                  placeholder={options.length ? "Add a data source…" : "No compatible sources"}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    {!o.implemented ? " (planned)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!pick || addMutation.isPending}
              onClick={() => {
                const [integrationId, capabilityKey] = pick.split("::");
                if (integrationId && capabilityKey)
                  addMutation.mutate({ integrationId, capabilityKey });
              }}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Add source</>
              )}
            </Button>
          </div>
        )}

        {integrations.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {DATA_SOURCE_STATE_LABELS['not_connected']}
          </div>
        )}

        {integrations.map((i) => {
          const label = providerLabel(i.provider);
          const rows = bindings.filter((b) => b.integrationId === i.integrationId);
          return (
            <div key={i.integrationId} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-lg">
                  {label.logo}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{i.displayName || label.name}</span>
                    {i.isMock && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Sample data
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {i.orgName ? `${i.orgName} • ` : ""}
                    {i.lastSyncAt
                      ? `Last sync ${new Date(i.lastSyncAt).toLocaleString()}`
                      : "Never synchronized"}
                  </div>
                  <div className="mt-2">
                    <StatePill state={i.state} />
                  </div>
                  {i.incompatibleReason && (
                    <p className="mt-2 text-xs text-muted-foreground">{i.incompatibleReason}</p>
                  )}

                  {rows.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {rows.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium">{b.capabilityName}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {b.capabilityKey}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={b.enabled}
                              disabled={!canManage || toggleMutation.isPending}
                              aria-label={`${b.enabled ? "Disable" : "Enable"} ${b.capabilityName} from ${label.name}`}
                              onCheckedChange={(v) =>
                                toggleMutation.mutate({ bindingId: b.id, enabled: v })
                              }
                            />
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Remove ${b.capabilityName} from ${agentName}`}
                                onClick={() => removeMutation.mutate(b.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </TabsContent>

      <TabsContent value="capabilities" className="mt-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          Capabilities describe what {agentName} can request. They are provider-neutral: any
          connector that implements a capability can serve it.
        </p>
        {capabilities.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium">{c.displayName}</span>
                <Badge variant={c.required ? "default" : "outline"} className="text-[10px]">
                  {c.required ? "required" : "optional"}
                </Badge>
                {c.readOnly && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    read only
                  </Badge>
                )}
              </div>
              {c.description && (
                <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
              )}
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">{c.key}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={previewMutation.isPending}
              onClick={() => previewMutation.mutate(c.key)}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Test</span>
            </Button>
          </div>
        ))}
        {capabilities.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No capabilities are registered for this agent yet.
          </div>
        )}
      </TabsContent>

      <TabsContent value="instructions" className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Instructions shape how {agentName} reasons. They never change which data it can read —
          that is controlled entirely by the data sources above.
        </p>
        {(
          [
            ["pre", "Pre-instructions", "Checks to run before analysis"],
            ["system", "System instructions", "Role, tone, and guardrails"],
            ["post", "Post-instructions", "Required shape of every recommendation"],
          ] as const
        ).map(([key, label, hint]) => (
          <div key={key} className="space-y-1.5">
            <label htmlFor={`instr-${key}`} className="text-xs font-medium">
              {label}
            </label>
            <Textarea
              id={`instr-${key}`}
              rows={3}
              value={instr[key]}
              placeholder={hint}
              disabled={!canManage}
              onChange={(e) => setInstr((s) => ({ ...s, [key]: e.target.value }))}
            />
          </div>
        ))}
        {canManage ? (
          <Button
            size="sm"
            disabled={instrMutation.isPending}
            onClick={() => instrMutation.mutate()}
          >
            {instrMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save instructions
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only workspace admins and managers can edit instructions.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
