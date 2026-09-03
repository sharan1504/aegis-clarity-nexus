import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Bot, BarChart3, History, Plug, Search, SearchCheck, Settings, ShieldCheck, Sparkles, Users, LayoutDashboard, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";

type SearchItem = { label: string; description: string; href: string; group: string; icon: LucideIcon };
const platformItems: SearchItem[] = [
  { label: "Command Center", description: "Operational dashboards and attention", href: "/", group: "Platform", icon: LayoutDashboard },
  { label: "Analytics", description: "Operational analytics and reports", href: "/analytics", group: "Platform", icon: BarChart3 },
  { label: "Vulnerabilities", description: "Operational and security findings", href: "/investigations", group: "Platform", icon: SearchCheck },
  { label: "AI Agents", description: "Deployed agents and available definitions", href: "/agents", group: "Platform", icon: Bot },
  { label: "Ask Aegis", description: "Ask about your organization, data and recommendations", href: "/chat", group: "Platform", icon: Sparkles },
  { label: "Approval Center", description: "Review governed changes", href: "/approvals", group: "Platform", icon: ShieldCheck },
  { label: "Integrations", description: "Connected enterprise systems", href: "/integrations", group: "Platform", icon: Plug },
  { label: "Audit Viewer", description: "Trace platform activity", href: "/audit", group: "Platform", icon: History },
  { label: "Guardrails", description: "Policies and governance controls", href: "/governance", group: "Platform", icon: ShieldCheck },
  { label: "User Management", description: "Workspace users and roles", href: "/users", group: "Platform", icon: Users },
  { label: "Settings", description: "Workspace configuration", href: "/settings", group: "Platform", icon: Settings },
];
export function GlobalSearch() {
  const navigate = useNavigate(); const { tenantId } = useTenantContext(); const [open, setOpen] = useState(false); const [items, setItems] = useState<SearchItem[]>(platformItems);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  useEffect(() => { let active = true; if (!tenantId) return; void Promise.all([supabase.from("integrations").select("display_name,provider,environment,status").eq("tenant_id", tenantId).order("display_name").limit(40), supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name").limit(40), supabase.from("change_records").select("id,change_id,title,stage,severity,owner_team").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(40)]).then(([integrations, agents, changes]) => { if (!active) return; const connected: SearchItem[] = (integrations.data ?? []).map((x) => ({ label: x.display_name ?? x.provider, description: `${x.provider} · ${x.environment ?? "Production"} · ${x.status}`, href: "/integrations", group: "Connected systems", icon: Plug })); const agentRows: SearchItem[] = (agents.data ?? []).map((x) => ({ label: x.display_name, description: `${x.category ?? "Agent"} · ${x.description ?? ""}`.trim(), href: `/agent/${x.agent_key}`, group: "Agents", icon: Bot })); const changeRows: SearchItem[] = (changes.data ?? []).map((x) => ({ label: `${x.change_id} · ${x.title}`, description: `${x.stage} · ${x.severity} · ${x.owner_team ?? ""}`.trim(), href: `/approvals/${x.id}`, group: "Recommendations & changes", icon: ShieldCheck })); setItems([...platformItems, ...connected, ...agentRows, ...changeRows]); }); return () => { active = false; }; }, [tenantId]);
  const groups = useMemo(() => items.reduce<Record<string, SearchItem[]>>((acc, item) => { (acc[item.group] ??= []).push(item); return acc; }, {}), [items]);
  return <><button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Search className="h-4 w-4" /><span className="flex-1 text-left">Search</span><kbd className="rounded border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl K</kbd></button><CommandDialog open={open} onOpenChange={setOpen}><CommandInput placeholder="Search Aegis, features, agents, integrations, changes…" /><CommandList><CommandEmpty>No matching Aegis resources found.</CommandEmpty>{Object.entries(groups).map(([group, groupItems]) => <CommandGroup key={group} heading={group}>{groupItems.map((item) => { const Icon = item.icon; return <CommandItem key={`${group}:${item.label}`} value={`${item.label} ${item.description}`} onSelect={() => { setOpen(false); void navigate({ to: item.href as never }); }}><Icon /><span className="min-w-0"><span className="block truncate">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span></CommandItem>; })}</CommandGroup>)}</CommandList></CommandDialog></>;
}
