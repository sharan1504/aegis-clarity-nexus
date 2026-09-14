import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Bot, History, Plug, SearchCheck, Settings, ShieldAlert, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useTenantContext } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { listOperationalIssues } from "@/lib/operational-console.functions";

const nav = [
  { section: "Overview", items: [
    { title: "Command Center", url: "/", icon: Sparkles },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Vulnerabilities", url: "/investigations", icon: SearchCheck },
  ] },
  { section: "AI Operations", items: [
    { title: "AI Agents", url: "/agents", icon: Bot },
    { title: "CenOps Copilot", url: "/chat", icon: Sparkles },
    { title: "CenOps Copilot", url: "/chat", icon: Sparkles },
    { title: "Agentic Studio", url: "/agentic-studio", icon: Workflow },
    { title: "Agent Governance", url: "/agentic-studio/governance", icon: ShieldCheck },
    { title: "Approval Center", url: "/approvals", icon: ShieldCheck },
  ] },
  { section: "Data & Systems", items: [
    { title: "Integrations", url: "/integrations", icon: Plug },
    { title: "ITSM Routing", url: "/settings/itsm-routing", icon: Settings },
    { title: "Operational Console", url: "/operational-console", icon: Activity },
    { title: "Audit Viewer", url: "/audit", icon: History },
  ] },
  { section: "Administration", items: [
    { title: "Guardrails", url: "/governance", icon: ShieldAlert },
    { title: "User Management", url: "/users", icon: Users },
    { title: "Settings", url: "/settings", icon: Settings },
  ] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { tenantName, primaryDomain } = useTenantContext();
  const [openHighCritical, setOpenHighCritical] = useState(0);
  const loadIssues = useServerFn(listOperationalIssues);
  const workspaceName = tenantName ?? "Workspace";
  const isActive = (url: string) => url === "/" ? path === "/" : (url === "/agentic-studio" || url === "/settings" ? path === url : path.startsWith(url));

  useEffect(() => {
    let active = true;
    void loadIssues({ data: {} }).then((result) => { if (active && result.ok) setOpenHighCritical(result.openHighCritical); }).catch(() => undefined);
    return () => { active = false; };
  }, [loadIssues, path]);

  return <Sidebar collapsible="icon">
    <SidebarHeader className="border-b border-sidebar-border/70">
      <div className="flex items-center gap-3 px-3 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground shadow-[0_0_24px_color-mix(in_oklab,var(--color-primary)_24%,transparent)]">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && <div className="min-w-0 leading-tight"><div className="text-[17px] font-extrabold tracking-[-0.02em] text-sidebar-foreground">CenOps</div><div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">AI Control Plane for Enterprise Operations</div></div>}
      </div>
    </SidebarHeader>

    <SidebarContent className="px-2 py-2">
      {nav.map((group) => <SidebarGroup key={group.section} className="py-2">
        {!collapsed && <SidebarGroupLabel className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{group.section}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {group.items.map((item) => <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className="h-9 rounded-lg px-3 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:text-sidebar-foreground">
                <Link to={item.url} className="flex items-center gap-3">
                  <item.icon className="h-[17px] w-[17px] shrink-0" />
                  {!collapsed && <span className="flex min-w-0 flex-1 items-center gap-2"><span className="truncate">{item.title}</span>{item.url === "/operational-console" && openHighCritical > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 rounded-full px-1 text-[10px]">{openHighCritical}</Badge>}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>

    <SidebarFooter className="border-t border-sidebar-border/70 p-2">
      {!collapsed && <div className="mb-2 rounded-xl border border-sidebar-border bg-sidebar-accent/20 px-3 py-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-sidebar-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />Protected operations</div>
      </div>}
      <div className="rounded-lg px-3 py-2 text-[10px] text-muted-foreground">
        {!collapsed ? <><div className="truncate font-medium text-sidebar-foreground/80">{workspaceName}</div><div className="truncate">{primaryDomain ?? "Production workspace"}</div></> : <div className="text-center font-semibold">{workspaceName.slice(0, 1).toUpperCase()}</div>}
      </div>
    </SidebarFooter>
  </Sidebar>;
}
