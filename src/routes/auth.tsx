import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Network, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth")({ head: () => pageHead({ path: "/auth", title: "Sign in — CenOps", description: "Sign in to CenOps.", noindex: true }), component: AuthPage });

function AuthNetworkVisual() {
  return <div aria-hidden="true" className="relative mx-auto flex h-48 w-full max-w-lg items-center justify-center"><div className="absolute h-40 w-40 rounded-full bg-white/10 blur-2xl" /><svg viewBox="0 0 520 220" className="relative h-full w-full overflow-visible" fill="none"><g stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5"><path d="M90 110L185 58L260 110L350 55L430 108L350 165L260 110L185 164L90 110Z" /><path d="M185 58L185 164M350 55L350 165M260 110L430 108M90 110L260 110" /></g><g fill="currentColor"><circle cx="90" cy="110" r="8" fillOpacity="0.95" /><circle cx="185" cy="58" r="7" fillOpacity="0.7" /><circle cx="185" cy="164" r="7" fillOpacity="0.55" /><circle cx="260" cy="110" r="11" fillOpacity="1" /><circle cx="350" cy="55" r="7" fillOpacity="0.7" /><circle cx="350" cy="165" r="7" fillOpacity="0.55" /><circle cx="430" cy="108" r="8" fillOpacity="0.85" /></g><circle cx="260" cy="110" r="19" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" /></svg><div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white/75 backdrop-blur"><Network className="h-3.5 w-3.5" />Governed enterprise automation</div></div>;
}

function AuthPage() {
  const navigate = useNavigate(); const [loading, setLoading] = useState(false); const [mode, setMode] = useState<"signin" | "signup">("signin"); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error;
        if (data.user.user_metadata?.force_password_change === true) { navigate({ to: "/auth/change-password" }); return; }
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } }); if (error) throw error;
        toast.success("Workspace created", { description: "Your tenant is being provisioned with reference data." });
      }
      navigate({ to: "/" });
    } catch (err) { toast.error("Could not sign in", { description: err instanceof Error ? err.message : "Please try again." }); } finally { setLoading(false); }
  };
  const google = async () => {
    try { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error)); if (result.redirected) return; navigate({ to: "/" }); }
    catch (err) { toast.error("Google sign-in unavailable", { description: err instanceof Error ? err.message : "Please try email sign-in." }); }
  };
  return <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(16,185,129,0.12),transparent_32%)] md:grid md:grid-cols-2">
    <div className="relative min-h-[460px] overflow-hidden bg-gradient-to-br from-primary via-primary/85 to-accent text-primary-foreground md:min-h-screen"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.10),transparent_45%)]" /><div className="relative flex min-h-[460px] flex-col justify-between p-8 sm:p-10 md:min-h-screen md:p-12"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur"><Sparkles className="h-5 w-5" /></div><span className="text-lg font-semibold tracking-tight">CenOps</span></div><AuthNetworkVisual /><div className="max-w-md space-y-4"><h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Enterprise AI operations, unified.</h2><p className="text-primary-foreground/80">Connect enterprise systems and let specialized AI agents monitor, optimize, and automate — with humans in the loop.</p><ul className="space-y-1.5 text-sm text-primary-foreground/70"><li>• MCP-ready integration layer</li><li>• Human approval for every write</li><li>• RBAC and immutable audit logs built in</li></ul></div><div className="pt-8 text-xs text-primary-foreground/60">© {new Date().getFullYear()} CenOps — Enterprise AI Operations Platform</div></div></div>
    <div className="flex min-h-[calc(100vh-460px)] items-center justify-center bg-background/90 p-6 backdrop-blur-sm sm:p-8 md:min-h-screen md:bg-transparent"><Card className="w-full max-w-md border-border/70 bg-card/95 shadow-xl shadow-primary/5 backdrop-blur"><CardHeader><CardTitle className="text-2xl">Sign in</CardTitle><CardDescription>Welcome back — use your CenOps work account to continue.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="grid gap-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div><div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div><Button type="submit" className="w-full" disabled={loading}>{loading ? mode === "signin" ? "Signing in…" : "Creating workspace…" : mode === "signin" ? "Sign in" : "Create account"}</Button><Button type="button" variant="outline" className="w-full" disabled={loading} onClick={google}>Continue with Google</Button><p className="text-center text-xs text-muted-foreground">{mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}<button type="button" className="text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create one" : "Sign in"}</button></p></form></CardContent></Card></div>
  </div>;
}
