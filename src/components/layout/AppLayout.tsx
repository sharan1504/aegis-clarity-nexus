import { Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, ShieldCheck, Sun, AlertTriangle, ChevronDown, CircleHelp, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppSidebar } from "./AppSidebar";
import { GlobalSearch } from "./GlobalSearch";
import { useTheme } from "@/lib/theme";
import { RoleProvider, useRole } from "@/lib/rbac";
import { TenantProvider, useTenantContext } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";
import { updateEnvironmentMode } from "@/lib/settings.functions";
import { toast } from "sonner";
import { FeatureHelpButton } from "@/components/onboarding/FeatureHelpDrawer";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { getOnboardingState, saveOnboardingState, type OnboardingState } from "@/lib/onboarding.functions";
import { FEATURE_HELP_BY_PATH, ONBOARDING_VISIT_PATHS } from "@/lib/onboarding-config";

export function AppLayout() { return <TenantProvider><RoleProvider><AppShell /></RoleProvider></TenantProvider>; }

function OnboardingExperience() {
  const { tenantId, environmentMode, loading } = useTenantContext();
  const path = useRouterState({ select: (router) => router.location.pathname });
  const searchStr = useRouterState({ select: (router) => router.location.searchStr });
  const load = useServerFn(getOnboardingState);
  const save = useServerFn(saveOnboardingState);
  const [state, setState] = useState<OnboardingState | null>(null);
  const manual = new URLSearchParams(searchStr).get("onboarding") === "1";

  useEffect(() => {
    if (!tenantId || loading) return;
    void load().then(setState).catch(() => setState(null));
  }, [tenantId, loading, load]);

  useEffect(() => {
    if (!tenantId || !state?.eligible) return;
    const feature = ONBOARDING_VISIT_PATHS[path];
    if (!feature || state.visitedFeatures[feature]) return;
    void save({ data: { visitedFeature: feature } }).then((next) => {
      setState(next);
      window.dispatchEvent(new Event("cenops:onboarding-updated"));
    }).catch(() => undefined);
  }, [tenantId, path, state, save]);

  useEffect(() => {
    if (!manual || !tenantId) return;
    void save({ data: { tourDismissed: false } }).then(setState).catch(() => undefined);
  }, [manual, tenantId, save]);

  const automatic = Boolean(state?.eligible && environmentMode === "demo" && !state.tourCompleted && !state.tourDismissed);
  const open = manual || automatic;
  if (!open) return null;

  const close = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (manual) window.history.replaceState(null, "", window.location.pathname);
  };

  return <OnboardingTour open={open} state={state} onOpenChange={close} />;
}

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
    <button type="button" disabled={!isAdmin || saving} onClick={() => isAdmin && setOpen(true)} className="inline-flex h-8 items-center rounded-full border border-border bg-card/50 px-1 text-[10px] font-semibold shadow-sm transition hover:border-primary/40" title={isAdmin ? "Change workspace environment mode" : "Only workspace administrators can change environment mode"}>
      <span className={`rounded-full px-2 py-1 ${environmentMode === "live" ? "bg-success/15 text-success" : "text-muted-foreground"}`}>Live</span>
      <span className={`rounded-full px-2 py-1 ${environmentMode === "demo" ? "bg-warning/15 text-warning-foreground" : "text-muted-foreground"}`}>Demo</span>
    </button>
    <AlertDialog open={open} onOpenChange={(value) => !saving && setOpen(value)}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Switch workspace to {nextMode === "demo" ? "Demo" : "Live"}?</AlertDialogTitle><AlertDialogDescription>{nextMode === "demo" ? "Switching to Demo replaces all views with mock data for every user in this workspace until it is switched back. No external provider is contacted by the demo fixtures." : "Switching to Live removes all mock data from the application and shows only real connected workspace data. If providers are not connected, pages will show real empty states or errors."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void apply(); }}>{saving ? "Applying…" : `Switch to ${nextMode === "demo" ? "Demo" : "Live"}`}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const { role } = useRole();
  const { user, tenantId, tenantName, environmentMode, loading, provisioningError, refreshTenant } = useTenantContext();
  const navigate = useNavigate();
  const path = useRouterState({ select: (router) => router.location.pathname });
  const isChat = path === "/chat";
  const initials = (user?.email ?? "AW").replace(/@.*$/, "").split(/[.\-_]/).map((part) => part.charAt(0).toUpperCase()).slice(0, 2).join("");
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  const demo = environmentMode === "demo";
  const helpTopic = FEATURE_HELP_BY_PATH[path];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6 animate-pulse" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Setting up your workspace…</h1>
          <p className="mt-2 text-sm text-muted-foreground">Securing your account and loading your organization.</p>
        </div>
      </div>
    );
  }

  if (provisioningError || !tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Workspace setup needs attention</h1>
          <p className="mt-2 text-sm text-muted-foreground">{provisioningError ?? "Your account is not attached to a workspace."}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button type="button" onClick={() => void refreshTenant()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <SidebarProvider>
    <div className={`flex min-h-screen w-full flex-col ${demo ? "border-t-2 border-warning" : ""}`}>
      {demo && <div className="sticky top-0 z-50 flex min-h-7 items-center justify-center gap-2 bg-warning px-3 py-1 text-center text-[11px] font-semibold text-warning-foreground"><AlertTriangle className="h-3.5 w-3.5" />DEMO MODE — This workspace is using mock data.</div>}
      <div className="flex min-h-[calc(100vh-1.75rem)] w-full bg-background">
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          {!isChat && <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-xl lg:px-5">
            <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground lg:hidden" />
            <GlobalSearch />
            {helpTopic && <FeatureHelpButton topicId={helpTopic} />}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Badge variant="outline" className="hidden h-8 gap-1.5 rounded-lg border-border bg-card/40 px-2.5 text-[10px] font-medium xl:flex"><span className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-warning" : "bg-success shadow-[0_0_7px_var(--color-success)]"}`} />{tenantName ? tenantName : "All systems operational"}</Badge>
              <EnvironmentModeControl />
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground" title="Open Help Center"><Link to="/help"><CircleHelp className="mr-1.5 h-4 w-4" />Help</Link></Button>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
              <NotificationCenter />
              <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
                <Avatar className="h-8 w-8 border border-primary/30"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials || "AW"}</AvatarFallback></Avatar>
                <div className="hidden max-w-[150px] leading-tight sm:block"><div className="truncate text-xs font-semibold">{user?.email?.replace(/@.*$/, "") ?? "Workspace user"}</div><div className="flex items-center gap-1 text-[10px] text-muted-foreground">{role}<ChevronDown className="h-3 w-3" /></div></div>
                {user && <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="hidden h-8 w-8 text-muted-foreground hover:text-foreground md:flex"><LogOut className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          </header>}
          <main className={isChat ? "min-h-[calc(100vh-1.75rem)] flex-1 p-0" : "min-h-[calc(100vh-4rem)] flex-1 p-4 sm:p-5 lg:p-6"}><Outlet /></main>
        </SidebarInset>
      </div>
    </div>
    <OnboardingExperience />
    <Toaster richColors position="bottom-right" />
  </SidebarProvider>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>; }

import { AlertOctagon, AlertTriangle as SeverityAlertTriangle, Info, Minus, ShieldAlert } from "lucide-react";
export function SeverityBadge({ severity }: { severity: string }) { const map: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = { critical: { cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: ShieldAlert }, high: { cls: "bg-warning/15 text-warning-foreground border-warning/40", Icon: AlertOctagon }, medium: { cls: "bg-info/15 text-info border-info/30", Icon: SeverityAlertTriangle }, low: { cls: "bg-muted text-muted-foreground border-border", Icon: Minus }, info: { cls: "bg-muted text-muted-foreground border-border", Icon: Info } }; const entry = map[severity.toLowerCase()] ?? map.info; const { Icon } = entry; return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${entry.cls}`}><Icon className="h-3 w-3" />{severity}</span>; }
export function StatusPill({ tone = "neutral", icon: Icon, children }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) { const map = { success: "bg-success/15 text-success border-success/30", warning: "bg-warning/20 text-warning-foreground border-warning/50", danger: "bg-destructive/15 text-destructive border-destructive/30", info: "bg-info/15 text-info border-info/30", neutral: "bg-muted text-muted-foreground border-border" } as const; return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${map[tone]}`}>{Icon && <Icon className="h-3 w-3" />}{children}</span>; }
