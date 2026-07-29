import { Link } from "@tanstack/react-router";
import { AlertOctagon, Bell, CheckCheck, Clock, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Notification, NotificationKind } from "@/lib/change-data";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useRealtime,
} from "@/lib/realtime";

const kindMeta: Record<NotificationKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  approval_deadline: { icon: Clock, tone: "text-warning-foreground" },
  security_alert: { icon: ShieldAlert, tone: "text-destructive" },
  incident: { icon: AlertOctagon, tone: "text-destructive" },
  info: { icon: Bell, tone: "text-muted-foreground" },
};

export function NotificationCenter() {
  const { notifications: items, connected } = useRealtime();
  const unread = items.filter((n) => n.unread).length;

  const markAll = () => markAllNotificationsRead();
  const readOne = (id: string) => markNotificationRead(id);


  const render = (list: Notification[]) => (
    <div className="max-h-[420px] space-y-1 overflow-y-auto">
      {list.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">Nothing here.</div>
      )}
      {list.map((n) => {
        const { icon: Icon, tone } = kindMeta[n.kind];
        const inner = (
          <div
            className={`group flex gap-3 rounded-md p-2.5 transition hover:bg-accent/40 ${
              n.unread ? "bg-primary/[0.04]" : ""
            }`}
            onClick={() => readOne(n.id)}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium leading-tight">{n.title}</span>
                {n.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{n.ts}</div>
            </div>
          </div>
        );
        return n.href ? (
          <Link key={n.id} to={n.href as never} className="block">
            {inner}
          </Link>
        ) : (
          <div key={n.id}>{inner}</div>
        );
      })}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-success" : "bg-muted-foreground/50"}`}
              />
              {unread} unread · {connected ? "live" : "offline"} · email + in-app
            </div>

          </div>
          <Button size="sm" variant="ghost" onClick={markAll} className="text-xs">
            <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-2">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="approval_deadline" className="text-xs">Approvals</TabsTrigger>
            <TabsTrigger value="security_alert" className="text-xs">Security</TabsTrigger>
            <TabsTrigger value="incident" className="text-xs">Incidents</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="p-2">{render(items)}</TabsContent>
          <TabsContent value="approval_deadline" className="p-2">{render(items.filter((n) => n.kind === "approval_deadline"))}</TabsContent>
          <TabsContent value="security_alert" className="p-2">{render(items.filter((n) => n.kind === "security_alert"))}</TabsContent>
          <TabsContent value="incident" className="p-2">{render(items.filter((n) => n.kind === "incident"))}</TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
