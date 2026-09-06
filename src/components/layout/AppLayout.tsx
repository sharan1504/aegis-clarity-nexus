import { Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, ShieldCheck, Sun, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppSidebar } from "./AppSidebar";
import { useTheme } from "@/lib/theme";
import { RoleProvider, useRole } from "@/lib/rbac";
import { TenantProvider, useTenantContext } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";
import { updateEnvironmentMode } from "@/lib/settings.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function AppLayout() { return <TenantProvider><RoleProvider><AppShell /></RoleProvider></TenantProvider>; }

function EnvironmentModeControl() {
  const { environmentMode, refreshTenant } = useTenantContext();
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isAdmin = role === "Admin";
  const nextMode = environmentMode === "demo" ? "live" : "demo";
  const apply = async () => {
    setSaving(true);
    try { await updateEnvironmentMode({ data: { environmentMode: nextMode } }); await refreshTenant(); toast.success(`Workspace switched to ${nextMode === "demo" ? "Demo" : "Live"} mode.`); setOpen(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not change workspace environment mode."); }
    finally { setSaving(false); }
  };
  return <>
    <button type="button" disabled={!isAdmin || saving} onClick={() => isAdmin && setOpen(true)} className={`inline-flex h-8 items-center rounded-full border px-1 text-[11px] font-semibold transition ${isAdmin ? "cursor-pointer" : "cursor-default opacity-90"}`} title={isAdmin ? "Change workspace environment mode" : "Only workspace administrators can change environment mode"}>
      <span className={`rounded-full px-2 py-1 ${environmentMode === "live" ? "bg-success text-success-foreground" : "text-muted-foreground"}`}>Live</span>
      <span className={`rounded-full px-2 py-1 ${environmentMode === "demo" ? "bg-warning text-warning-foreground" : "text-muted-foreground"}`}>Demo</span>
    </button>
    <AlertDialog open={open} onOpenChange={(value) => !saving && setOpen(value)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch workspace to {nextMode === "demo" ? "Demo" : "Live"}?</AlertDialogTitle>
          <AlertDialogDescription>
            {nextMode === "demo" ? "Switching to Demo replaces all views with mock data for every user in this workspace until it is switched back. No external provider is contacted by the demo fixtures." : "Switching to Live removes all mock data from the application and shows only real connected workspace data. If providers are not connected, pages will show real empty states or errors."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void apply(); }}>{saving ? "Applying…" : `Switch to ${nextMode === "demo" ? "Demo" : "Live"}`}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const { role } = useRole();
  const { user, tenantName, environmentMode, loading } = useTenantContext();
  const navigate = useNavigate();
  const initials = (user?.email ?? "AW").replace(/@.*$/, "").split(/[.\-_]/).map((part) => part.charAt(0).toUpperCase()).slice(0, 2).join("");
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  const demo = environmentMode === "demo";
  return <SidebarProvider>
    <div className={`flex min-h-screen w-full flex-col ${demo ? "border-t-4 border-warning" : ""}`}>
      {demo && <div className="sticky top-0 z-40 flex min-h-8 items-center justify-center gap-2 bg-warning px-3 py-1.5 text-center text-xs font-bold text-warning-foreground shadow-sm"><AlertTriangle className="h-4 w-4" />DEMO MODE — All data shown in this workspace is mock data. Do not treat records as customer production data.</div>}
      <div className="flex min-h-[calc(100vh-2rem)] w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden gap-1.5 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-warning" : "bg-success"}`} />{tenantName ? `${tenantName} workspace` : "All systems operational"}</Badge>
              <EnvironmentModeControl />
              <div className="hidden items-center gap-1.5 md:flex"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /><Badge variant="outline" className="h-8 px-2 text-xs font-medium" title="Role assigned in your workspace">{role}</Badge></div>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
              <NotificationCenter />
              <div className="ml-1 flex items-center gap-2 border-l border-border pl-2"><Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/15 text-primary text-xs">{initials || "AW"}</AvatarFallback></Avatar><div className="hidden max-w-[160px] text-xs leading-tight sm:block"><div className="truncate font-medium">{user?.email ?? "Signed out"}</div><div className="text-muted-foreground">{role}</div></div>{user && <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>}</div>
            </div>
          </header>
          <main className="flex-1 p-6">{loading ? <div className="space-y-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div> : <Outlet />}</main>
        </SidebarInset>
      </div>
    </div>
    <Toaster richColors position="bottom-right" />
  </SidebarProvider>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>; }

import { AlertOctagon, AlertTriangle as SeverityAlertTriangle, Info, Minus, ShieldAlert } from "lucide-react";
export function SeverityBadge({ severity }: { severity: string }) { const map: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = { critical: { cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: ShieldAlert }, high: { cls: "bg-warning/15 text-warning-foreground border-warning/40", Icon: AlertOctagon }, medium: { cls: "bg-info/15 text-info border-info/30", Icon: SeverityAlertTriangle }, low: { cls: "bg-muted text-muted-foreground border-border", Icon: Minus }, info: { cls: "bg-muted text-muted-foreground border-border", Icon: Info } }; const entry = map[severity.toLowerCase()] ?? map.info; const { Icon } = entry; return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${entry.cls}`}><Icon className="h-3 w-3" />{severity}</span>; }
export function StatusPill({ tone = "neutral", icon: Icon, children }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) { const map = { success: "bg-success/15 text-success border-success/30", warning: "bg-warning/20 text-warning-foreground border-warning/50", danger: "bg-destructive/15 text-destructive border-destructive/30", info: "bg-info/15 text-info border-info/30", neutral: "bg-muted text-muted-foreground border-border" } as const; return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${map[tone]}`}>{Icon && <Icon className="h-3 w-3" />}{children}</span>; }
