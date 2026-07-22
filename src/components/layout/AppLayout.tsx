import { Outlet } from "@tanstack/react-router";
import { Bell, Moon, Search, ShieldCheck, Sun } from "lucide-react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "./AppSidebar";
import { useTheme } from "@/lib/theme";
import { RoleProvider, ROLES, useRole } from "@/lib/rbac";

export function AppLayout() {
  return (
    <RoleProvider>
      <AppShell />
    </RoleProvider>
  );
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const { role, setRole } = useRole();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search resources, incidents, recommendations…"
                className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden gap-1.5 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> All systems operational
              </Badge>
              <div className="hidden items-center gap-1.5 md:flex">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Switch role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
              </Button>
              <div className="ml-1 flex items-center gap-2 pl-2 border-l border-border">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs">AW</AvatarFallback>
                </Avatar>
                <div className="hidden text-xs leading-tight sm:block">
                  <div className="font-medium">Amelia Ward</div>
                  <div className="text-muted-foreground">{role}</div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    high: "bg-warning/15 text-warning-foreground border-warning/40",
    medium: "bg-info/15 text-info border-info/30",
    low: "bg-muted text-muted-foreground border-border",
    info: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${map[severity] ?? map.info}`}
    >
      {severity}
    </span>
  );
}
