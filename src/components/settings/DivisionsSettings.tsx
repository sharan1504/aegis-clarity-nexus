import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Save, Trash2, Users, Bot, Plug, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { createWorkspaceDivision, deleteWorkspaceDivision, listWorkspaceDivisions, setDivisionAgentAccess, setDivisionConnectionAccess, setDivisionUserAccess, updateWorkspaceDivision } from "@/lib/organization-settings.functions";

type Directory = Awaited<ReturnType<typeof listWorkspaceDivisions>>;
const EMPTY = { name: "", key: "", description: "", parentDivisionId: "" };

export function DivisionsSettings() {
  const load = useServerFn(listWorkspaceDivisions);
  const create = useServerFn(createWorkspaceDivision);
  const update = useServerFn(updateWorkspaceDivision);
  const remove = useServerFn(deleteWorkspaceDivision);
  const setUser = useServerFn(setDivisionUserAccess);
  const setAgent = useServerFn(setDivisionAgentAccess);
  const setConnection = useServerFn(setDivisionConnectionAccess);
  const [data, setData] = useState<Directory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);

  const refresh = async () => { try { const next = await load(); setData(next); setSelectedId((id) => id || next.divisions[0]?.id || ""); } catch (e) { toast.error("Divisions could not be loaded", { description: e instanceof Error ? e.message : "Try again." }); } };
  useEffect(() => { void refresh(); }, []);
  const selected = data?.divisions.find((d) => d.id === selectedId) ?? null;

  useEffect(() => { if (selected) setForm({ name: selected.display_name, key: selected.department_key, description: selected.description ?? "", parentDivisionId: selected.parent_department_id ?? "" }); }, [selectedId, selected?.id]);

  const children = useMemo(() => new Map<string | null, Directory["divisions"]>([]), [data]);
  const topLevel = data?.divisions.filter((d) => !d.parent_department_id) ?? [];
  const descendants = (parentId: string): Directory["divisions"] => data?.divisions.filter((d) => d.parent_department_id === parentId) ?? [];

  const save = async () => {
    if (!selected) return;
    try { await update({ data: { id: selected.id, name: form.name, key: form.key, description: form.description, parentDivisionId: form.parentDivisionId || null, active: selected.active, scope: selected.scope ?? {} } }); toast.success("Division updated"); await refresh(); }
    catch (e) { toast.error("Division could not be updated", { description: e instanceof Error ? e.message : "Try again." }); }
  };
  const add = async () => {
    if (!form.name) return;
    try { const result = await create({ data: { name: form.name, key: form.key, description: form.description, parentDivisionId: form.parentDivisionId || null } }); toast.success("Division created"); setCreating(false); setForm(EMPTY); await refresh(); setSelectedId(result.division.id); }
    catch (e) { toast.error("Division could not be created", { description: e instanceof Error ? e.message : "Try again." }); }
  };
  const deleteDivision = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.display_name}? Users must be reassigned first.`)) return;
    try { await remove({ data: { id: selected.id } }); toast.success("Division deleted"); setSelectedId(""); await refresh(); }
    catch (e) { toast.error("Division could not be deleted", { description: e instanceof Error ? e.message : "Try again." }); }
  };
  const toggleUser = async (userId: string, checked: boolean, role = "member") => {
    if (!selected) return;
    try { await setUser({ data: { userId, divisionId: selected.id, role, enabled: checked } }); setData((current) => current ? { ...current, memberships: checked ? [...current.memberships.filter((m) => !(m.user_id === userId && m.department_id === selected.id)), { user_id: userId, department_id: selected.id, role }] : current.memberships.filter((m) => !(m.user_id === userId && m.department_id === selected.id)) } : current); }
    catch (e) { toast.error("Division membership could not be updated", { description: e instanceof Error ? e.message : "Try again." }); }
  };
  const changeUserRole = async (userId: string, role: string) => { if (!selected) return; try { await setUser({ data: { userId, divisionId: selected.id, role, enabled: true } }); setData((current) => current ? { ...current, memberships: current.memberships.map((m) => m.user_id === userId && m.department_id === selected.id ? { ...m, role } : m) } : current); } catch (e) { toast.error("Division role could not be updated", { description: e instanceof Error ? e.message : "Try again." }); } };
  const toggleAgent = async (agentKey: string, checked: boolean) => { if (!selected) return; try { await setAgent({ data: { divisionId: selected.id, agentKey, enabled: checked } }); setData((current) => current ? { ...current, agentAccess: [...current.agentAccess.filter((a) => !(a.department_id === selected.id && a.agent_key === agentKey)), { department_id: selected.id, agent_key: agentKey, enabled: checked }] } : current); } catch (e) { toast.error("Agent access could not be updated", { description: e instanceof Error ? e.message : "Try again." }); } };
  const toggleConnection = async (connectionId: string, checked: boolean) => { if (!selected) return; try { await setConnection({ data: { divisionId: selected.id, connectionId, enabled: checked } }); setData((current) => current ? { ...current, connectionAccess: [...current.connectionAccess.filter((a) => !(a.department_id === selected.id && a.connection_id === connectionId)), { department_id: selected.id, connection_id: connectionId, enabled: checked }] } : current); } catch (e) { toast.error("Integration access could not be updated", { description: e instanceof Error ? e.message : "Try again." }); } };

  return <div className="space-y-5">
    <PageHeader title="Divisions" description="Create the organizational structure that controls user membership, agent access and connected integration scope." actions={<Button onClick={() => { setCreating(true); setForm(EMPTY); }}><Plus className="mr-1.5 h-4 w-4" /> New division</Button>} />
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle className="text-sm">Organization structure</CardTitle><CardDescription>Divisions can contain subdivisions.</CardDescription></CardHeader><CardContent className="space-y-1">{topLevel.map((division) => <DivisionTree key={division.id} division={division} children={descendants(division.id)} selectedId={selectedId} onSelect={setSelectedId} all={data?.divisions ?? []} />)}{!topLevel.length && <div className="text-sm text-muted-foreground">Create your first division.</div>}</CardContent></Card>
      <Card>{selected ? <><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{selected.display_name}</CardTitle><CardDescription>{selected.description || "No division description."}</CardDescription></div><Badge variant="outline">{selected.department_key}</Badge></div></CardHeader><CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-2"><Label>Division key</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></div><div className="space-y-2 md:col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this division owns" /></div><div className="space-y-2"><Label>Parent division</Label><Select value={form.parentDivisionId || "none"} onValueChange={(v) => setForm({ ...form, parentDivisionId: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No parent — top-level</SelectItem>{(data?.divisions ?? []).filter((d) => d.id !== selected.id).map((d) => <SelectItem key={d.id} value={d.id}>{d.display_name}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="flex justify-between"><Button onClick={() => void save()}><Save className="mr-1.5 h-4 w-4" /> Save division</Button><Button variant="outline" className="text-destructive" onClick={() => void deleteDivision()}><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button></div>
        <Separator />
        <section><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Users & division roles</div><div className="space-y-2">{(data?.users ?? []).map((user) => { const membership = data?.memberships.find((m) => m.user_id === user.id && m.department_id === selected.id); return <div key={user.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"><input type="checkbox" checked={Boolean(membership)} onChange={(e) => void toggleUser(user.id, e.target.checked, membership?.role ?? "member")} /><div className="min-w-[160px] flex-1"><div className="text-sm font-medium">{user.full_name || user.email}</div><div className="text-xs text-muted-foreground">{user.email}</div></div>{membership && <Select value={membership.role} onValueChange={(role) => void changeUserRole(user.id, role)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{["owner","admin","manager","member","viewer"].map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select>}</div>; })}</div></section>
        <Separator />
        <section><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" /> Agent access</div><div className="space-y-2">{(data?.agents ?? []).map((agent) => <div key={agent.agent_key} className="flex items-center justify-between rounded-lg border p-2.5"><div><div className="text-sm font-medium">{agent.display_name || agent.agent_key}</div><div className="text-xs text-muted-foreground">{agent.category || "Agent"} · {agent.description}</div></div><Switch checked={data?.agentAccess.some((a) => a.department_id === selected.id && a.agent_key === agent.agent_key && a.enabled) ?? false} onCheckedChange={(checked) => void toggleAgent(agent.agent_key, checked)} /></div>)}</div></section>
        <Separator />
        <section><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plug className="h-4 w-4" /> Integration scope</div><div className="space-y-2">{(data?.connections ?? []).map((connection) => <div key={connection.id} className="flex items-center justify-between rounded-lg border p-2.5"><div><div className="text-sm font-medium">{connection.display_name || connection.provider}</div><div className="text-xs text-muted-foreground">{connection.provider} · {connection.environment || "Production"} · {connection.status}</div></div><Switch checked={data?.connectionAccess.some((a) => a.department_id === selected.id && a.connection_id === connection.id && a.enabled) ?? false} onCheckedChange={(checked) => void toggleConnection(connection.id, checked)} /></div>)}</div></section>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-1 h-4 w-4" /> Division membership is the organizational boundary. Groups inherit the division boundary and cannot grant access outside it.</div>
      </CardContent></> : <CardContent className="flex min-h-[480px] items-center justify-center text-sm text-muted-foreground">Select a division to configure it.</CardContent>}</Card>
    </div>
    {creating && <Card><CardHeader><CardTitle className="text-sm">Create division</CardTitle><CardDescription>Use a top-level division or place it under another division.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Name</Label><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Home Division" /></div><div className="space-y-2"><Label>Key</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="home" /></div><div className="space-y-2 md:col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="space-y-2"><Label>Parent division</Label><Select value={form.parentDivisionId || "none"} onValueChange={(v) => setForm({ ...form, parentDivisionId: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No parent</SelectItem>{(data?.divisions ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.display_name}</SelectItem>)}</SelectContent></Select></div></div><div className="flex gap-2"><Button onClick={() => void add()}>Create division</Button><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button></div></CardContent></Card>}
  </div>;
}

function DivisionTree({ division, children, selectedId, onSelect, all }: { division: Directory["divisions"][number]; children: Directory["divisions"]; selectedId: string; onSelect: (id: string) => void; all: Directory["divisions"] }) {
  const childRows = all.filter((d) => d.parent_department_id === division.id);
  return <div><button type="button" onClick={() => onSelect(division.id)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${selectedId === division.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted"}`}><Building2 className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{division.display_name}</span><span className="text-[10px] text-muted-foreground">{childRows.length}</span></button><div className="ml-5 border-l pl-2">{children.map((child) => <DivisionTree key={child.id} division={child} children={all.filter((d) => d.parent_department_id === child.id)} selectedId={selectedId} onSelect={onSelect} all={all} />)}</div></div>;
}
