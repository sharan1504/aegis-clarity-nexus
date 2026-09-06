import { Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { EnvironmentModeToggle } from "@/components/layout/EnvironmentModeToggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "./AppSidebar";
import { useTheme } from "@/lib/theme";
import { RoleProvider, useRole } from "@/lib/rbac";
import { TenantProvider, useTenantContext } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLayout() {
  return <TenantProvider><RoleProvider><AppShell /></RoleProvider></TenantProvider>;
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const { role } = useRole();
  const { user, tenantName, loading, environmentMode } = useTenantContext();
  const navigate = useNavigate();
  const initials = (user?.email ?? "AW").replace(/@.*$/, "").split(/[.\-_]/).map((part) => part.charAt(0).toUpperCase()).slice(0, 2).join("");
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  return <SidebarProvider>
    <div className={`flex min-h-screen w-full bg-background ${environmentMode === "demo" ? "border-t-4 border-primary" : ""}`}>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <EnvironmentModeToggle />
            <Badge variant="outline" className="hidden gap-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-success" />{tenantName ? `${tenantName} workspace` : "All systems operational"}</Badge>
            <div className="hidden items-center gap-1.5 md:flex"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /><Badge variant="outline" className="h-8 px-2 text-xs font-medium" title="Role assigned in your workspace">{role}</Badge></div>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <NotificationCenter />
            <div className="ml-1 flex items-center gap-2 border-l border-border pl-2"><Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/15 text-primary text-xs">{initials || "AW"}</AvatarFallback></Avatar><div className="hidden max-w-[160px] text-xs leading-tight sm:block"><div className="truncate font-medium">{user?.email ?? "Signed out"}</div><div className="text-muted-foreground">{role}</div></div>{user && <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>}</div>
          </div>
        </header>
        {environmentMode === "demo" && <div className="border-b border-primary bg-primary/10 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">DEMO ENVIRONMENT · All workspace views use mock data · No provider mutations</div>}
        <main className="flex-1 p-6">{loading ? <div className="space-y-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div> : <Outlet />}</main>
      </SidebarInset>
    </div>
    <Toaster richColors position="bottom-right" />
  </SidebarProvider>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>;
}

import { AlertOctagon, AlertTriangle, Info, Minus, ShieldAlert } from "lucide-react";
export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = { critical: { cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: ShieldAlert }, high: { cls: "bg-warning/15 text-warning-foreground border-warning/40", Icon: AlertOctagon }, medium: { cls: "bg-info/15 text-info border-info/30", Icon: AlertTriangle }, low: { cls: "bg-muted text-muted-foreground border-border", Icon: Minus }, info: { cls: "bg-muted text-muted-foreground border-border", Icon: Info } };
  const entry = map[severity.toLowerCase()] ?? map.info; const { Icon } = entry;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${entry.cls}`}><Icon className="h-3 w-3" />{severity}</span>;
}
export function StatusPill({ tone = "neutral", icon: Icon, children }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const map = { success: "bg-success/15 text-success border-success/30", warning: "bg-warning/20 text-warning-foreground border-warning/50", danger: "bg-destructive/15 text-destructive border-destructive/30", info: "bg-info/15 text-info border-info/30", neutral: "bg-muted text-muted-foreground border-border" } as const;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${map[tone]}`}>{Icon && <Icon className="h-3 w-3" />}{children}</span>;
}
