import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAgentConfiguration, saveAgentConfiguration } from "@/lib/agent-configuration.functions";

export function AgentPurposeEditor({ agentKey, agentName }: { agentKey: string; agentName: string }) {
  const qc = useQueryClient();
  const getConfig = useServerFn(getAgentConfiguration), saveConfig = useServerFn(saveAgentConfiguration);
  const key = ["agent-configuration", agentKey];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => getConfig({ data: { agentKey } }) });
  const [purpose, setPurpose] = useState("");
  useEffect(() => { if (data?.ok) setPurpose(data.settings.purposeBehavior); }, [data]);
  const mutation = useMutation({ mutationFn: () => saveConfig({ data: { agentKey, purposeBehavior: purpose, policyRules: data?.ok ? data.settings.policyRules : [] } }), onSuccess: (r) => { if (r.ok) { toast.success("Purpose and behavior saved"); void qc.invalidateQueries({ queryKey: key }); } else toast.error(r.errorMessage); } });
  if (isLoading) return null;
  return <Card className="mt-6 border-primary/20 bg-primary/[0.03]"><CardHeader><CardTitle className="text-base">Purpose &amp; Behavior</CardTitle><CardDescription>Define the stable responsibility, operating behavior, execution approach and production boundaries for {agentName}. This is agent context, not a permission grant; capabilities, policies and approvals remain enforced separately.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea value={purpose} disabled={!data?.canManage} onChange={(e) => setPurpose(e.target.value)} placeholder="Example: Identify licenses unused for 90 days, explain the evidence, recommend reclamation, require approval for production changes, and verify the license state after execution." className="min-h-40" />{data?.canManage ? <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}><Save className="mr-1.5 h-4 w-4" />{mutation.isPending ? "Saving…" : "Save purpose"}</Button> : <p className="text-xs text-muted-foreground">Only workspace admins and managers can edit agent purpose.</p>}</CardContent></Card>;
}
