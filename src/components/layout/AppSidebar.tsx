import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, Plug, ShieldAlert, ShieldCheck, Users, Settings, Sparkles, History, BarChart3, SearchCheck } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useTenantContext } from "@/lib/tenant";
import { GlobalSearch } from "./GlobalSearch";

const nav = [
  { section: "Overview", items: [{ title: "Command Center", url: "/", icon: Sparkles }, { title: "Analytics", url: "/analytics", icon: BarChart3 }, { title: "Vulnerabilities", url: "/investigations", icon: SearchCheck }] },
  { section: "AI Operations", items: [{ title: "AI Agents", url: "/agents", icon: Bot }, { title: "Approval Center", url: "/approvals", icon: ShieldCheck }] },
  { section: "Data & Systems", items: [{ title: "Integrations", url: "/integrations", icon: Plug }, { title: "Audit Viewer", url: "/audit", icon: History }] },
  { section: "Administration", items: [{ title: "Guardrails", url: "/governance", icon: ShieldAlert }, { title: "User Management", url: "/users", icon: Users }, { title: "Settings", url: "/settings", icon: Settings }] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { tenantName, primaryDomain } = useTenantContext();
  const isActive = (url: string) => url === "/" ? path === "/" : path.startsWith(url);
  const workspaceName = tenantName ?? "Workspace";
  return <Sidebar collapsible="icon">
    <SidebarHeader className="border-b border-sidebar-border"><div className="flex items-center gap-2.5 px-2 py-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Sparkles className="h-4 w-4" /></div>{!collapsed && <div className="flex flex-col leading-tight"><span className="text-sm font-semibold tracking-tight">Aegis AI</span><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Enterprise AI Ops</span></div>}</div></SidebarHeader>
    <SidebarContent>
      {!collapsed && <SidebarGroup><SidebarGroupContent><GlobalSearch /></SidebarGroupContent></SidebarGroup>}
      {!collapsed && <SidebarGroup><SidebarGroupContent><Link to="/chat" className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"><Sparkles className="h-4 w-4" /><span>Ask Aegis</span></Link></SidebarGroupContent></SidebarGroup>}
      {nav.map((group) => <SidebarGroup key={group.section}>{!collapsed && <SidebarGroupLabel>{group.section}</SidebarGroupLabel>}<SidebarGroupContent><SidebarMenu>{group.items.map((item) => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}><Link to={item.url} className="flex items-center gap-2"><item.icon className="h-4 w-4 shrink-0" />{!collapsed && <span>{item.title}</span>}</Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border">{!collapsed ? <div className="px-2 py-2 text-[11px] text-muted-foreground"><div className="font-medium text-sidebar-foreground">{workspaceName}</div>{primaryDomain ? <div className="truncate">{primaryDomain}</div> : <div>Tenant • Production</div>}</div> : <div className="flex justify-center py-2 text-xs text-muted-foreground">{workspaceName.slice(0, 1).toUpperCase()}</div>}</SidebarFooter>
  </Sidebar>;
}
