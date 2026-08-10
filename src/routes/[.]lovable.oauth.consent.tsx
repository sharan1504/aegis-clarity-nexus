import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { redirect_url?: string; redirect_to?: string } | null;
type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
} | null;

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult; error: { message: string } | null }>;
};

function oauthApi(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: ({ search }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { needsSignIn: true as const, details: null };

    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return {
      needsSignIn: false as const,
      details: data,
      email: sessionData.session.user.email ?? null,
    };
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization request failed</CardTitle>
          <CardDescription>
            {String((error as Error)?.message ?? error)}
          </CardDescription>
        </CardHeader>
      </Card>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Aegis AI</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConsentPage() {
  const loaded = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loaded.needsSignIn) {
    return <SignInCard onSignedIn={() => router.invalidate()} />;
  }

  const clientName =
    loaded.details?.client?.name ?? loaded.details?.client?.client_name ?? "an application";
  const scopes: string[] = (loaded.details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <Shell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Connect {clientName} to Aegis AI</CardTitle>
          <CardDescription>
            {clientName} will be able to call this app's enabled tools while you are signed in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-mono text-xs">{loaded.email ?? "unknown"}</span>
            </div>
            {loaded.details?.client?.redirect_uri && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Redirect</span>
                <span className="truncate font-mono text-xs">
                  {loaded.details.client.redirect_uri}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="font-medium">This grants access to</div>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Read Aegis change records, approvals, and audit history</li>
              <li>• Read agent findings, integrations, incidents, and security alerts</li>
              <li>• Read executive report datasets and AI recommendations</li>
              {scopes
                .filter((s) => !["openid", "email", "profile"].includes(s))
                .map((s) => (
                  <li key={s}>• Additional permission requested: {s}</li>
                ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This does not bypass Aegis permissions or backend policies.
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </Button>
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
              Cancel connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}

function SignInCard({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      onSignedIn();
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (!data.session) {
      setMessage("Check your email to confirm your account, then return to this page.");
      return;
    }
    onSignedIn();
  }

  return (
    <Shell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to continue</CardTitle>
          <CardDescription>
            Authorize an external client to use Aegis AI as you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="consent-email">Work email</Label>
              <Input
                id="consent-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="consent-password">Password</Label>
              <Input
                id="consent-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setMessage(null);
              }}
            >
              {mode === "signin"
                ? "No account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
