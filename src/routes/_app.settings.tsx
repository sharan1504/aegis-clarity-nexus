import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();

  return (
    <div>
      <PageHeader title="Settings" description="Workspace, security, and preferences." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
            <CardDescription>Primary tenant details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="org">Organization name</Label>
              <Input id="org" defaultValue="Contoso Corp" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dom">Primary domain</Label>
              <Input id="dom" defaultValue="contoso.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tz">Default timezone</Label>
              <Input id="tz" defaultValue="America/New_York" />
            </div>
            <Button size="sm">Save changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
            <CardDescription>SSO, MFA, and session policy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row label="Single Sign-On (SAML)" hint="Configured — Okta">
              <Switch defaultChecked />
            </Row>
            <Separator />
            <Row label="Enforce MFA" hint="Required for Admin and Manager roles">
              <Switch defaultChecked />
            </Row>
            <Separator />
            <Row label="Session timeout" hint="Sign out inactive users after 60 minutes">
              <Switch defaultChecked />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Theme and density</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row label="Dark mode" hint={`Currently ${theme}`}>
              <Switch checked={theme === "dark"} onCheckedChange={toggle} />
            </Row>
            <Separator />
            <Row label="Compact tables" hint="Denser rows in data views">
              <Switch />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Preferences</CardTitle>
            <CardDescription>Autonomy and safety controls for agents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row label="Require approval for all actions" hint="Human-in-the-loop for every write">
              <Switch defaultChecked />
            </Row>
            <Separator />
            <Row label="Auto-generate rollback plans" hint="Every action ships with an undo">
              <Switch defaultChecked />
            </Row>
            <Separator />
            <Row label="Redact PII in prompts" hint="Names, emails, and IDs masked">
              <Switch defaultChecked />
            </Row>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
