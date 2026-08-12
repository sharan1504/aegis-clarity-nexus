import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, Shield } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { users, auditLog } from "@/lib/mock-data";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/users")({
  head: () => pageHead({ path: "/users", title: "Team & Roles — Aegis AI", description: "Manage members and role-based access for Admin, Manager, Analyst, and Viewer users across your Aegis AI tenant." }),
  component: UsersPage,
});

const roleColor: Record<string, string> = {
  Admin: "bg-primary/15 text-primary border-primary/30",
  Manager: "bg-info/15 text-info border-info/30",
  Analyst: "bg-accent/15 text-accent-foreground border-accent/30",
  Viewer: "bg-muted text-muted-foreground border-border",
};

function UsersPage() {
  return (
    <div>
      <PageHeader
        title="User Management"
        description="Multi-tenant RBAC, SSO-ready, with full audit trail."
        actions={
          <Button size="sm">
            <UserPlus className="mr-1.5 h-4 w-4" /> Invite user
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>5 users across 2 tenants</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-muted text-xs">
                            {u.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.tenant}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${roleColor[u.role]}`}>
                        <Shield className="mr-1 h-3 w-3" /> {u.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={u.status === "active" ? "border-success/40 text-success" : ""}
                      >
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.lastActive}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit Log</CardTitle>
            <CardDescription>Today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLog.map((a, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <div className="w-14 shrink-0 font-mono text-muted-foreground">{a.ts}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground">
                    <span className="font-medium">{a.actor}</span> {a.action}
                  </div>
                  <div className="text-muted-foreground">{a.target}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
