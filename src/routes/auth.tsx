import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-accent lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Aegis AI</span>
          </div>
          <div className="max-w-md space-y-4">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">
              Enterprise AI operations, unified.
            </h2>
            <p className="text-primary-foreground/80">
              Connect Genesys, AWS, Azure, Microsoft 365, Jira, ServiceNow, Salesforce, Slack, and GitHub.
              Let specialized AI agents monitor, optimize, and automate — with humans in the loop.
            </p>
            <ul className="space-y-1.5 text-sm text-primary-foreground/70">
              <li>• MCP-ready integration layer</li>
              <li>• Human approval for every write</li>
              <li>• SSO, RBAC, and audit logs built in</li>
            </ul>
          </div>
          <div className="text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} Aegis AI — Enterprise AI Operations Platform
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Welcome back — use your work account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setTimeout(() => navigate({ to: "/" }), 500);
              }}
              className="space-y-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" required defaultValue="amelia.ward@contoso.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required defaultValue="••••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <Button type="button" variant="outline" className="w-full">
                Continue with SSO
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No account? <Link to="/" className="text-primary hover:underline">Explore the demo</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
