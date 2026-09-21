import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Server, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bindExternalMcpToolToAgent, connectMcpServer, discoverMcpServerTools, listMcpServers } from "@/lib/mcp/external.functions";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";

export const Route = createFileRoute("/_app/integrations/mcp")({ component: ExternalMcpPage });

function ExternalMcpPage() {
  const { tenantId } = useTenantContext();
  const connect = useServerFn(connectMcpServer);
  const discover = useServerFn(discoverMcpServerTools);
  const bind = useServerFn(bindExternalMcpToolToAgent);
  const list = useServerFn(listMcpServers);
  const [name,setName]=useState("");
  const [url,setUrl]=useState("");
  const [token,setToken]=useState("");
  const [servers,setServers]=useState<any[]>([]);
  const [agents,setAgents]=useState<any[]>([]);
  const [selectedAgent,setSelectedAgent]=useState("");
  const [loading,setLoading]=useState(false);
  const load=async()=>{setLoading(true);try{const result=await list();if(result.ok)setServers(result.servers);}catch(e){toast.error(e instanceof Error?e.message:"Unable to load MCP servers.");}finally{setLoading(false);}};
  useEffect(()=>{void load();},[tenantId]);
  useEffect(()=>{if(!tenantId)return;void supabase.from("agent_definitions").select("agent_key,display_name").order("display_name").then(({data})=>{setAgents(data??[]);if(!selectedAgent&&data?.[0]?.agent_key)setSelectedAgent(data[0].agent_key);});},[tenantId,selectedAgent]);
  const connectServer=async()=>{try{const result=await connect({data:{displayName:name,baseUrl:url,token}});if(!result.ok)throw new Error("MCP server connection failed.");toast.success("External MCP server connected");setName("");setUrl("");setToken("");await load();}catch(e){toast.error(e instanceof Error?e.message:"Unable to connect external MCP server.");}};
  const discoverTools=async(id:string)=>{try{const result=await discover({data:{serverId:id}});if(!result.ok)throw new Error("Discovery failed.");toast.success("MCP tools discovered",{description:String(result.count)+" tools registered."});await load();}catch(e){toast.error(e instanceof Error?e.message:"Unable to discover tools.");}};
  const bindTool=async(toolName:string)=>{if(!selectedAgent){toast.error("Select an agent first.");return;}try{await bind({data:{agentKey:selectedAgent,toolName}});toast.success("Tool bound to agent",{description:toolName});}catch(e){toast.error(e instanceof Error?e.message:"Unable to bind tool.");}};
  return <div className="space-y-6">
    <PageHeader title="External MCP servers" description="Connect customer-managed MCP servers, discover read-only tools, and explicitly bind them to agents. Provider mutations remain outside this path." actions={<Badge variant="outline"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Admin / Manager</Badge>} />
    <Card><CardHeader><CardTitle className="text-base">Connect MCP server</CardTitle><CardDescription>Only HTTPS endpoints are accepted. Bearer tokens are encrypted at rest and never shown after save.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-4"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" /><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://mcp.example.com" /><Input value={token} onChange={e=>setToken(e.target.value)} placeholder="Bearer token (optional)" type="password" /><Button onClick={()=>void connectServer()} disabled={!name.trim()||!url.trim()}>Connect & test</Button></CardContent></Card>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Connected servers</CardTitle><CardDescription>Discovery registers remote tools in the same governed MCP catalog.</CardDescription></div><Button variant="ghost" size="icon" onClick={()=>void load()} disabled={loading} aria-label="Refresh"><RefreshCw className={loading?"h-4 w-4 animate-spin":"h-4 w-4"} /></Button></div></CardHeader><CardContent className="space-y-3">{servers.length?servers.map(server=><div key={server.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{server.display_name}</div><div className="text-xs text-muted-foreground">{server.base_url}</div></div><Badge variant={server.status==="connected"?"secondary":"outline"}>{server.status}</Badge></div><div className="mt-3"><Button size="sm" variant="outline" onClick={()=>void discoverTools(server.id)}><Wrench className="mr-1.5 h-3.5 w-3.5" />Discover tools</Button></div></div>):<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No external MCP servers are connected.</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Bind discovered tools</CardTitle><CardDescription>Bindings are explicit and agent-scoped. Discovered tools remain unavailable until a manager or admin binds them.</CardDescription></CardHeader><CardContent className="space-y-4"><Select value={selectedAgent} onValueChange={setSelectedAgent}><SelectTrigger className="max-w-md"><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent>{agents.map(agent=><SelectItem key={agent.agent_key} value={agent.agent_key}>{agent.display_name}</SelectItem>)}</SelectContent></Select><div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">After discovery, external tools appear in Agentic Studio with an <strong>External</strong> origin and a blocked reason until bound. Tool invocation is still subject to run-stage and guardrail checks.</div></CardContent></Card>
  </div>;
}
