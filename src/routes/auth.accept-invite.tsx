import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth/accept-invite")({
  head: () => pageHead({ path: "/auth/accept-invite", title: "Accept Invitation — Aegis AI", description: "Complete your Aegis AI workspace invitation.", noindex: true }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadInviteSession = async () => {
      // Supabase processes the invite tokens from the URL hash and creates the
      // authenticated session before this page is rendered.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !data.session?.user) {
        setError("This invitation is invalid or has expired. Please ask the workspace administrator to send a new invitation.");
        setLoading(false);
        return;
      }
      setEmail(data.session.user.email ?? "");
      setFullName((data.session.user.user_metadata?.full_name as string | undefined) ?? "");
      setLoading(false);
    };
    void loadInviteSession();
    return () => { active = false; };
  }, []);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      });
      if (updateError) throw updateError;
      if (!data.user) throw new Error("Your invitation session could not be completed.");

      toast.success("Invitation accepted", { description: "Your Aegis workspace is ready." });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the invitation.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
          <CardTitle>Complete your Aegis invitation</CardTitle>
          <CardDescription>You have been invited to an existing Aegis workspace. Set your password to finish joining it.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {!error || email ? (
            <form onSubmit={accept} className="space-y-4">
              <div className="grid gap-2"><Label>Email</Label><Input value={email} disabled /></div>
              <div className="grid gap-2"><Label htmlFor="invite-name">Full name</Label><Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
              <div className="grid gap-2"><Label htmlFor="invite-password">Password</Label><Input id="invite-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></div>
              <div className="grid gap-2"><Label htmlFor="invite-password-confirm">Confirm password</Label><Input id="invite-password-confirm" type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{saving ? "Joining workspace…" : "Accept invitation"}</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
