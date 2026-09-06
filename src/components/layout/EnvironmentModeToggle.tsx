import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateWorkspaceEnvironmentMode } from "@/lib/settings.functions";
import { useRole } from "@/lib/rbac";
import { useTenantContext } from "@/lib/tenant";

export function EnvironmentModeToggle() {
  const { environmentMode, refreshTenant } = useTenantContext();
  const { role } = useRole();
  const updateMode = useServerFn(updateWorkspaceEnvironmentMode);
  const [target, setTarget] = useState<"live" | "demo" | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = role === "Admin";

  const confirm = async () => {
    if (!target || !isAdmin || target === environmentMode) return;
    setSaving(true);
    try {
      await updateMode({ data: { environmentMode: target } });
      await refreshTenant();
      setTarget(null);
      toast.success(`Workspace switched to ${target === "demo" ? "Demo" : "Live"} mode`);
    } catch (error) {
      toast.error("Could not change workspace mode", { description: error instanceof Error ? error.message : "Please retry." });
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="flex items-center rounded-full border bg-muted/40 p-0.5" role="group" aria-label="Workspace environment mode">
      {(["live", "demo"] as const).map((mode) => <Button key={mode} type="button" size="sm" variant={environmentMode === mode ? "default" : "ghost"} className="h-7 rounded-full px-3 text-xs" disabled={!isAdmin || saving} onClick={() => setTarget(mode)} title={isAdmin ? `Switch workspace to ${mode}` : `Workspace is in ${environmentMode} mode; only admins can change it`}>{mode === "live" ? "Live" : "Demo"}</Button>)}
    </div>
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !saving) setTarget(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Switch workspace to {target === "demo" ? "Demo" : "Live"} mode?</DialogTitle>
          <DialogDescription>{target === "demo" ? "Switching to Demo replaces all views with deterministic mock data for every user in this workspace until an admin switches back. No connected provider is mutated." : "Switching to Live removes mock data from all views and shows only real connected provider data. If no provider is connected, pages will show their real empty states."}</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setTarget(null)}>Cancel</Button><Button disabled={saving} onClick={() => void confirm()}>{saving ? "Switching…" : `Switch to ${target === "demo" ? "Demo" : "Live"}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
