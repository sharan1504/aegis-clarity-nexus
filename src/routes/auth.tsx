import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Bot, BrainCircuit, CheckCircle2, Network, ShieldCheck, Sparkles, Workflow } from "lucide-react";
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

function AICoreVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-56 w-full max-w-xl">
      <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-violet-300/30 bg-violet-500/10 shadow-[0_0_70px_rgba(139,92,246,0.3)] backdrop-blur-xl rotate-45">
        <div className="-rotate-45 flex h-full items-center justify-center">
          <BrainCircuit className="h-12 w-12 text-violet-200" />
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/15" />
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300/10" />
      {[
        { icon: Network, label: "Integrate", position: "left-3 top-1/2 -translate-y-1/2" },
        { icon: Bot, label: "Agents", position: "right-3 top-1/2 -translate-y-1/2" },
        { icon: ShieldCheck, label: "Govern", position: "left-1/2 top-1 -translate-x-1/2" },
        { icon: Workflow, label: "Automate", position: "left-1/2 bottom-0 -translate-x-1/2" },
      ].map(({ icon: Icon, label, position }) => (
        <div key={label} className={`absolute ${position} flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/75 backdrop-blur-xl`}>
          <Icon className="h-3.5 w-3.5 text-violet-300" />
          {label}
        </div>
      ))}
      <div className="absolute inset-x-24 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-300/25 to-transparent" />
      <div className="absolute left-1/2 inset-y-10 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-violet-300/20 to-transparent" />
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
    <div className="min-h-screen bg-[#060713] text-white lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <section className="relative hidden min-h-screen overflow-hidden lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(124,58,237,0.25),transparent_30%),radial-gradient(circle_at_72%_75%,rgba(37,99,235,0.18),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />

        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/15 shadow-[0_0_24px_rgba(139,92,246,0.18)]">
              <Sparkles className="h-5 w-5 text-violet-200" />
            </div>
            <span className="text-lg font-semibold tracking-tight">CenOps</span>
            <span className="ml-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
              AI Operations
            </span>
          </div>

          <div className="mx-auto w-full max-w-3xl py-10">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/[0.06] px-3 py-1.5 text-[11px] font-medium text-violet-200/80">
              <Activity className="h-3.5 w-3.5" />
              Governed enterprise automation
            </div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.04] tracking-[-0.035em] xl:text-6xl">
              From insight to action —
              <span className="block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">
                with AI.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/55 xl:text-lg">
              Connect, analyze and automate enterprise operations with specialized AI agents — under human control.
            </p>

            <AICoreVisual />

            <div className="grid max-w-2xl grid-cols-4 gap-3">
              {[
                { icon: Network, title: "Integrate", text: "Systems" },
                { icon: Bot, title: "AI Agents", text: "& Automation" },
                { icon: ShieldCheck, title: "Governance", text: "& Guardrails" },
                { icon: CheckCircle2, title: "Audit", text: "& Compliance" },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-white/8 bg-white/[0.035] p-3.5 backdrop-blur-sm">
                  <Icon className="h-4 w-4 text-violet-300" />
                  <p className="mt-3 text-xs font-semibold text-white/85">{title}</p>
                  <p className="mt-0.5 text-[10px] text-white/35">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-white/30">
            <span>© {new Date().getFullYear()} CenOps</span>
            <span>Secure • Governed • Enterprise Ready</span>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8fc] px-5 py-10 text-slate-950 sm:px-8">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold tracking-tight">CenOps</span>
            </div>
            <p className="mt-5 text-2xl font-semibold tracking-tight">
              From insight to action — <span className="text-violet-600">with AI.</span>
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Governed AI operations for modern enterprises.
            </p>
          </div>

          <Card className="border-slate-200/80 bg-white/90 shadow-2xl shadow-slate-900/[0.08] backdrop-blur-xl">
            <CardHeader className="space-y-2 pb-5">
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl tracking-tight">{mode === "signin" ? "Sign in" : "Create your account"}</CardTitle>
              <CardDescription className="text-slate-500">
                {mode === "signin"
                  ? "Access your governed AI operations workspace."
                  : "Set up your CenOps enterprise workspace."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-11 border-slate-200 bg-slate-50/70"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="h-11 border-slate-200 bg-slate-50/70"
                  />
                </div>

                <Button type="submit" className="h-11 w-full bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700" disabled={loading}>
                  {loading ? (mode === "signin" ? "Signing in…" : "Creating account…") : mode === "signin" ? "Sign in" : "Create account"}
                </Button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-[10px] uppercase tracking-widest text-slate-400">or</span></div>
                </div>

                <Button type="button" variant="outline" className="h-11 w-full border-slate-200 bg-white" disabled={loading} onClick={google}>
                  Continue with Google
                </Button>

                <p className="pt-1 text-center text-xs text-slate-500">
                  {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    className="font-medium text-violet-600 hover:underline"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  >
                    {mode === "signin" ? "Create one" : "Sign in"}
                  </button>
                </p>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-slate-400">
            <span>Secure access</span>
            <span>•</span>
            <span>Human oversight</span>
            <span>•</span>
            <span>Audit ready</span>
          </div>
        </div>
      </section>
    </div>
  );
}
