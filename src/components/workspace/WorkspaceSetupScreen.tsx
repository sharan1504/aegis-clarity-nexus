import { Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { createWorkspace } from "@/lib/workspace-onboarding.functions";
import type { WorkspaceSetupRole } from "@/lib/workspace-onboarding.functions";

const ROLES: Array<{ value: WorkspaceSetupRole; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "Full workspace administration, integrations, agents, governance and approvals." },
  { value: "manager", label: "Manager", description: "Manage operations, approvals, agents and integrations without full administration." },
  { value: "analyst", label: "Analyst", description: "Investigate operational data and work with findings and approvals." },
  { value: "viewer", label: "Viewer", description: "Read-only access to the workspace and its operational information." },
];

export function WorkspaceSetupScreen({
  userEmail,
  onCreated,
}: {
  userEmail?: string | null;
  onCreated: () => Promise<void> | void;
}) {
  const create = useServerFn(createWorkspace);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState<WorkspaceSetupRole>("admin");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      await create({ data: { name, description, role } });
      setCreated(true);
      await new Promise((resolve) => setTimeout(resolve, 450));
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not create your workspace.");
      setSaving(false);
    }
  };

  if (created) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Your workspace is being set up</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We are securing your workspace, applying your {ROLES.find((item) => item.value === role)?.label} role and preparing the Live control plane.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finishing setup…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.10),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(16,185,129,0.08),transparent_32%)] px-6 py-10">
      <Card className="w-full max-w-2xl border-border/70 shadow-xl">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-2xl">Create your workspace</CardTitle>
            <CardDescription className="mt-1">
              {userEmail ? "Signed in as " + userEmail + ". " : "Your Google account is signed in. "}
              Create a workspace to start using CenOps.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Acme Operations"
                minLength={2}
                maxLength={80}
                required
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Choose the name your team will see throughout CenOps.</p>
            </div>

            <div className="grid gap-2">
              <Label>Workspace role</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={saving}
                    onClick={() => setRole(item.value)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition",
                      role === item.value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {item.label}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                This role applies to you as the creator of this new workspace. Workspace members can be assigned roles later by an Admin.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="workspace-description">
                Workspace description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="workspace-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this workspace used for?"
                maxLength={500}
                rows={4}
                disabled={saving}
              />
            </div>

            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

            <Button type="submit" className="w-full sm:w-auto" disabled={saving || name.trim().length < 2}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating workspace…
                </>
              ) : (
                "Create workspace"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
