import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, FileLock2, Globe2, Users, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";

const items = [
  { label: "Workspace", description: "Organization profile, defaults and workspace-wide controls.", section: "workspace", href: "/settings", icon: Globe2 },
  { label: "Users", description: "Manage workspace members, roles and invitations.", section: "users", href: "/users", icon: Users },
  { label: "Divisions", description: "Define organizational boundaries and access scope.", section: "divisions", href: "/settings?section=divisions", icon: Building2 },
  { label: "Groups", description: "Organize users within their division boundaries.", section: "groups", href: "/settings?section=groups", icon: UsersRound },
  { label: "Privacy & AI", description: "Control AI data, privacy and evidence retention.", section: "privacy", href: "/settings?section=privacy", icon: FileLock2 },
] as const;

export function OrganizationSettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });
  const activeSection = pathname === "/users" ? "users" : new URLSearchParams(searchStr).get("section") || "workspace";

  return (
    <div className="space-y-5">
      <PageHeader title="Organization Settings" description="Manage your CenOps workspace, people, access boundaries, and data policies." />
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border bg-card p-2 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Settings</div>
          <nav className="space-y-1" aria-label="Organization settings">
            {items.map((item) => {
              const active = activeSection === item.section;
              return (
                <Link key={item.section} to={item.href as never} className={`flex items-start gap-3 rounded-lg px-3 py-3 transition-colors ${active ? "bg-primary/10 text-foreground ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                  <span className="min-w-0"><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span></span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
