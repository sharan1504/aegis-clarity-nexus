import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Server, Cloud, Workflow, Shield, DollarSign, Clock, Brain, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/resources/what-is-aiops")({
  head: () =>
    pageHead({
      path: "/resources/what-is-aiops",
      title: "What is AIOps? | Aegis AI Guide to AI Operations",
      description:
        "AIOps combines AI, machine learning, and automation with enterprise tools like AWS, Azure, and ServiceNow to reduce incidents, cut cloud costs, and accelerate IT operations.",
    }),
  component: WhatIsAIOpsPage,
});

function WhatIsAIOpsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-sm">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">Aegis AI</span>
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            <Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Platform
            </Link>
            <Link to="/marketplace" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Agent Marketplace
            </Link>
            <Link to="/auth">
              <Button size="sm">Sign in</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 md:py-20">
        <section className="mb-16 text-center md:mb-24">
          <Badge variant="secondary" className="mb-4">
            Enterprise AI Operations Guide
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            What is AIOps?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            AIOps — Artificial Intelligence for IT Operations — is the practice of using AI, machine learning, and automation to observe, correlate, and act on enterprise IT data at scale.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start with Aegis AI <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button variant="outline" size="lg">
                Explore AI Agents
              </Button>
            </Link>
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                AIOps explained in plain terms
              </h2>
              <p className="mt-4 text-muted-foreground">
                Modern enterprises run thousands of services across hybrid cloud, SaaS, and on-premise systems. The volume of logs, metrics, alerts, and tickets exceeds what human teams can reason about in real time.
              </p>
              <p className="mt-4 text-muted-foreground">
                AIOps platforms ingest this data, detect patterns, correlate events across tools, and either recommend or automatically execute the next best action. The result is faster incident response, fewer false positives, and more predictable operations.
              </p>
            </div>
            <div className="grid gap-4">
              {[
                { icon: Brain, label: "Machine learning", desc: "Learns normal behavior and spots anomalies before they become outages." },
                { icon: Workflow, label: "Correlation", desc: "Connects alerts from monitoring, ticketing, and change systems into a single incident narrative." },
                { icon: Shield, label: "Automation", desc: "Routes, escalates, remediates, and documents actions with human oversight where needed." },
              ].map((item) => (
                <Card key={item.label} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.label}</h3>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            How AIOps integrates with enterprise tools
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <Cloud className="h-5 w-5" />
                </div>
                <CardTitle>AWS</CardTitle>
                <CardDescription>CloudWatch, CloudTrail, and Cost Explorer</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  AIOps ingests AWS telemetry to correlate resource spikes with application latency, identify misconfigured services, and trigger remediation runbooks such as rightsizing or failover.
                </p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
                  <Cloud className="h-5 w-5" />
                </div>
                <CardTitle>Azure</CardTitle>
                <CardDescription>Monitor, Service Health, and Advisor</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Azure signals are unified with on-premise and multi-cloud data so AIOps can detect cross-tenant issues, surface Advisor recommendations, and enforce tagging and cost policies.
                </p>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                  <Server className="h-5 w-5" />
                </div>
                <CardTitle>ServiceNow</CardTitle>
                <CardDescription>ITSM, CMDB, and change management</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  ServiceNow change records, incidents, and CMDB relationships become context for AIOps decisions, ensuring every automated action is tracked, approved, and auditable.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Clock className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground md:text-2xl">Incident management</h2>
              <p className="mt-3 text-muted-foreground">
                AIOps reduces mean time to detect (MTTD) and mean time to resolve (MTTR) by automatically grouping related alerts, enriching them with change and deployment data, and suggesting or executing rollback plans.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Noise reduction through intelligent alert correlation",
                  "Root-cause hypotheses backed by evidence",
                  "Automatic ticket routing and team assignment",
                  "Integrated rollback and change-control workflows",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success">
                <DollarSign className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground md:text-2xl">Cost optimization</h2>
              <p className="mt-3 text-muted-foreground">
                AIOps continuously analyzes cloud billing, utilization, and reservation data to find waste, predict spend, and recommend rightsizing, reserved capacity, or scheduling changes.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Identify idle or underutilized resources",
                  "Forecast spend by team, service, or region",
                  "Recommend rightsizing and reserved instances",
                  "Track savings and attribute them to actions",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Key AIOps capabilities
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Observability data ingestion",
              "Anomaly detection",
              "Event correlation & grouping",
              "Causal analysis",
              "Predictive alerting",
              "Automated remediation",
              "Chat-driven operations",
              "Change risk scoring",
              "Executive reporting",
            ].map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span className="text-sm font-medium text-foreground">{cap}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Frequently asked questions
          </h2>
          <div className="grid gap-4">
            {[
              {
                q: "Is AIOps a replacement for IT staff?",
                a: "No. AIOps augments engineers by filtering noise, surfacing context, and automating repetitive actions. Humans remain accountable for decisions, approvals, and complex judgment.",
              },
              {
                q: "What data does AIOps need?",
                a: "Typical inputs include metrics, logs, traces, events, change records, tickets, cost data, and configuration items. The more context AIOps has, the more accurate its correlations become.",
              },
              {
                q: "How is AIOps different from traditional monitoring?",
                a: "Monitoring tells you what happened. AIOps explains why it happened, what is likely to happen next, and what to do about it — often without waiting for a human to ask.",
              },
              {
                q: "Can AIOps work with hybrid and multi-cloud environments?",
                a: "Yes. Modern AIOps platforms aggregate data from AWS, Azure, GCP, on-premise tools, and SaaS services into a single operational model.",
              },
            ].map((faq) => (
              <div key={faq.q} className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Put AIOps to work in your enterprise
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Aegis AI gives you an enterprise-grade AIOps platform with AI agents, change-control workflows, report generation, and multi-tenant security. Start free and connect your first integration in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button variant="outline" size="lg">
                Browse agents
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Aegis AI. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Platform
            </Link>
            <Link to="/auth" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
