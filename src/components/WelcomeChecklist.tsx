import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Plug, Users, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const KEY = "aegis.welcome.dismissed";
const DONE_KEY = "aegis.welcome.done";

type Step = {
  id: string;
  title: string;
  description: string;
  to: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
};

const steps: Step[] = [
  {
    id: "connect",
    title: "Connect your first integration",
    description: "Aegis needs at least one system (AWS, M365, Genesys…) to start generating insights.",
    to: "/integrations",
    cta: "Go to Integrations",
    icon: Plug,
  },
  {
    id: "invite",
    title: "Invite your team",
    description: "Add teammates as Admin, Manager, Analyst, or Viewer with granular RBAC.",
    to: "/users",
    cta: "Invite users",
    icon: Users,
  },
  {
    id: "review",
    title: "Review your first AI recommendation",
    description: "Approve, reject, or comment on an agent-proposed action in the Approval Center.",
    to: "/approvals",
    cta: "Open Approvals",
    icon: Sparkles,
  },
];

export function WelcomeChecklist() {
  const [dismissed, setDismissed] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDismissed(localStorage.getItem(KEY) === "1");
    try {
      setDone(JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}"));
    } catch {
      setDone({});
    }
  }, []);

  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    localStorage.setItem(DONE_KEY, JSON.stringify(next));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(KEY, "1");
  };

  if (dismissed) return null;
  const completedCount = steps.filter((s) => done[s.id]).length;

  return (
    <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Welcome to Aegis AI
          </CardTitle>
          <CardDescription>
            {completedCount} of {steps.length} setup steps complete — finish these to unlock the full platform.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss welcome checklist">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s) => {
          const isDone = !!done[s.id];
          return (
            <div
              key={s.id}
              className={`flex flex-col rounded-lg border p-3 transition ${
                isDone ? "border-success/40 bg-success/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggle(s.id)}
                  className="mt-0.5 shrink-0"
                  aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {s.title}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
              <Button asChild size="sm" variant={isDone ? "ghost" : "outline"} className="mt-3 self-start">
                <Link to={s.to}>
                  <s.icon className="mr-1.5 h-3.5 w-3.5" /> {s.cta}
                </Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
