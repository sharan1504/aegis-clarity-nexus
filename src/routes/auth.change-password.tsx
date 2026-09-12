import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth/change-password")({ head: () => pageHead({ path: "/auth/change-password", title: "Set your password — Aegis AI", description: "Create your permanent Aegis AI password.", noindex: true }), component: ChangePasswordPage });

function ChangePasswordPage() {
  const navigate = useNavigate(); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data, error: e }) => { if (e || !data.user) { navigate({ to: "/auth" }); return; } setEmail(data.user.email ?? ""); setLoading(false); }); }, [navigate]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(null); if (password.length < 8) { setError("Password must be at least 8 characters."); return; } if (password !== confirm) { setError("Passwords do not match."); return; } setSaving(true); try { const { data: userData, error: updateError } = await supabase.auth.updateUser({ password, data: { force_password_change: false } }); if (updateError) throw updateError; if (!userData.user) throw new Error("Your session could not be updated."); toast.success("Password changed", { description: "Your Aegis account is ready." }); navigate({ to: "/" }); } catch (err) { setError(err instanceof Error ? err.message : "Unable to change your password."); } finally { setSaving(false); } };
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return <div className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="w-full max-w-md"><CardHeader><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div><CardTitle>Create your permanent password</CardTitle><CardDescription>Your temporary password has been accepted. For security, you must create a new password before accessing the Aegis workspace.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4">{error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}<div className="grid gap-2"><Label>Email</Label><Input value={email} disabled /></div><div className="grid gap-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div><Button className="w-full" type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{saving ? "Updating password…" : "Set permanent password"}</Button></form></CardContent></Card></div>;
}
