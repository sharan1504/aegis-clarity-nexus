import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Bot, BrainCircuit, CheckCircle2, Eye, LockKeyhole, Network, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/auth")({
  head: () => pageHead({
    path: "/auth",
    title: "Sign in — CenOps",
    description: "Sign in to CenOps, the governed AI operations platform.",
    noindex: true,
  }),
  component: AuthPage,
});

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.35 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.2Z" />
      <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z" />
      <path fill="#FBBC05" d="M6.54 13.78A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.75 9.75 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.31l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.19c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.25 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 7.91 9.46 6.19 12 6.19Z" />
    </svg>
  );
}

function AICoreVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-56 w-full max-w-2xl">
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-500/25 to-blue-500/15 shadow-[0_0_80px_rgba(99,102,241,0.35)] backdrop-blur-xl">
        <div className="-rotate-45 flex h-full items-center justify-center">
          <BrainCircuit className="h-12 w-12 text-violet-100" />
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/15" />
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300/10" />
      {[
        { icon: Network, label: "Integrate", position: "left-0 top-1/2 -translate-y-1/2" },
        { icon: Bot, label: "AI Agents", position: "right-0 top-1/2 -translate-y-1/2" },
        { icon: ShieldCheck, label: "Govern", position: "left-1/2 top-0 -translate-x-1/2" },
        { icon: Workflow, label: "Automate", position: "left-1/2 bottom-0 -translate-x-1/2" },
      ].map(({ icon: Icon, label, position }) => (
        <div key={label} className={`absolute ${position} flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1028]/85 px-3.5 py-2.5 text-[11px] font-medium text-white/80 shadow-lg shadow-black/20 backdrop-blur-md`}>
          <Icon className="h-3.5 w-3.5 text-violet-300" />
          {label}
        </div>
      ))}
      <div className="absolute inset-x-16 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-300/30 to-transparent" />
      <div className="absolute left-1/2 inset-y-10 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-violet-300/25 to-transparent" />
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user.user_metadata?.force_password_change === true) {
          navigate({ to: "/auth/change-password" });
          return;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created", {
          description: "Your account is ready. Next, you will create your CenOps workspace.",
        });
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error("Could not sign in", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch (err) {
      toast.error("Google sign-in unavailable", {
        description: err instanceof Error ? err.message : "Please try email sign-in.",
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050817] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(124,58,237,0.24),transparent_28%),radial-gradient(circle_at_62%_42%,rgba(37,99,235,0.16),transparent_30%),radial-gradient(circle_at_82%_82%,rgba(79,70,229,0.18),transparent_28%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute -bottom-64 right-[-8%] h-[38rem] w-[55rem] rounded-[50%] border border-blue-400/15 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.12),transparent_62%)] shadow-[0_-20px_100px_rgba(37,99,235,0.12)]" />
      <div className="absolute -bottom-80 right-[-2%] h-[34rem] w-[48rem] rounded-[50%] border border-violet-400/10" />

      <div className="relative z-10 min-h-screen px-6 py-7 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/15 shadow-[0_0_28px_rgba(139,92,246,0.2)]">
              <Sparkles className="h-5 w-5 text-violet-100" />
            </div>
            <div>
              <span className="block text-lg font-semibold tracking-tight">CenOps</span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.2em] text-white/35">AI Operations Platform</span>
            </div>
          </div>
          <div className="hidden items-center gap-5 text-[11px] text-white/45 md:flex">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Secure by design</span>
            <span className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Enterprise ready</span>
            <span className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Governed AI operations</span>
          </div>
        </header>

        <main className="mx-auto grid min-h-[calc(100vh-104px)] max-w-[1500px] items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(400px,500px)] lg:gap-12 xl:gap-20">
          <section className="min-w-0">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/80">
                <Activity className="h-3.5 w-3.5" />
                Enterprise AI Operations
              </div>
              <h1 className="max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl xl:text-7xl">
                From insight
                <br />
                to action —
                <span className="block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">
                  with AI.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/55 sm:text-lg">
                Monitor, analyze and automate enterprise operations with specialized AI agents, under human control.
              </p>
            </div>

            <AICoreVisual />

            <div className="grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Network, title: "Integrate Systems", text: "Connect enterprise systems securely" },
                { icon: Bot, title: "AI Agents", text: "Specialized operational automation" },
                { icon: ShieldCheck, title: "Governance", text: "Human approval and guardrails" },
                { icon: CheckCircle2, title: "Audit", text: "Traceable actions and evidence" },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-white/10 bg-[#0b1028]/55 p-3.5 shadow-lg shadow-black/10 backdrop-blur-md">
                  <Icon className="h-4 w-4 text-violet-300" />
                  <p className="mt-3 text-xs font-semibold text-white/85">{title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-white/35">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative flex items-center justify-center lg:justify-end">
            <Card className="w-full max-w-[500px] border-white/15 bg-[#0b1028]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <CardHeader className="space-y-2 px-7 pb-5 pt-7 sm:px-9 sm:pt-9">
                <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-500/15 text-violet-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle className="text-3xl tracking-tight text-white">{mode === "signin" ? "Sign in" : "Create your account"}</CardTitle>
                <CardDescription className="text-white/50">
                  {mode === "signin" ? "Welcome back to CenOps." : "Set up your CenOps enterprise workspace."}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-7 pb-7 sm:px-9 sm:pb-9">
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-white/80">Work email</Label>
                    <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-12 border-white/10 bg-[#070b1c] text-white placeholder:text-white/25 focus-visible:ring-violet-500/50" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-white/80">Password</Label>
                    <div className="relative">
                      <Input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="h-12 border-white/10 bg-[#070b1c] pr-11 text-white placeholder:text-white/25 focus-visible:ring-violet-500/50" />
                      <Eye className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                    </div>
                  </div>

                  <Button type="submit" className="h-12 w-full bg-gradient-to-r from-violet-600 to-blue-500 text-white shadow-lg shadow-violet-600/20 hover:from-violet-500 hover:to-blue-400" disabled={loading}>
                    {loading ? (mode === "signin" ? "Signing in…" : "Creating account…") : mode === "signin" ? "Sign in" : "Create account"}
                  </Button>

                  <div className="relative py-1.5">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                    <div className="relative flex justify-center"><span className="bg-[#0b1028] px-3 text-[10px] uppercase tracking-widest text-white/30">or continue with</span></div>
                  </div>

                  <Button type="button" variant="outline" className="h-12 w-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white" disabled={loading} onClick={google}>
                    <GoogleMark />
                    Continue with Google
                  </Button>

                  <p className="pt-1 text-center text-xs text-white/45">
                    {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
                    <button type="button" className="font-medium text-violet-300 hover:text-violet-200 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                      {mode === "signin" ? "Create one" : "Sign in"}
                    </button>
                  </p>
                </form>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="flex items-center justify-between border-t border-white/5 pt-4 text-[10px] text-white/25">
          <span>© {new Date().getFullYear()} CenOps</span>
          <span className="hidden sm:inline">Secure • Governed • Enterprise Ready</span>
        </footer>
      </div>
    </div>
  );
}
