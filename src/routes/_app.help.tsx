import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, ChevronRight, ExternalLink, Menu, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HELP_GROUPS, HELP_TOPIC_BY_ID, HELP_TOPICS_WITH_PROVIDERS, type HelpTopic } from "@/lib/help/content";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/help")({
  validateSearch: (search: Record<string, unknown>) => ({ topic: typeof search.topic === "string" ? search.topic : undefined, onboarding: typeof search.onboarding === "string" ? search.onboarding : undefined }),
  head: () => pageHead({ path: "/help", title: "Help Center — CenOps", description: "In-product documentation for Aegis / CenOps operations, integrations, agents, governance and troubleshooting." }),
  component: HelpPage,
});

function HelpPage() {
  const { topic: searchTopic } = Route.useSearch();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedId = HELP_TOPIC_BY_ID[searchTopic ?? ""] ? searchTopic! : "platform-overview";
  const selected = HELP_TOPIC_BY_ID[selectedId];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HELP_TOPICS_WITH_PROVIDERS;
    return HELP_TOPICS_WITH_PROVIDERS.filter((topic) => {
      const haystack = [topic.title, topic.summary, topic.group, ...topic.sections.map((section) => `${section.heading} ${section.body} ${(section.bullets ?? []).join(" ")}`)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [search]);

  const selectTopic = (id: string) => {
    void navigate({ to: "/help", search: { topic: id } });
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help Center"
        description="Operational documentation for Aegis / CenOps. The guidance below is based on the current product surfaces and intentionally distinguishes contract-backed evidence from auth-only or catalog-only states."
        actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/" search={{ onboarding: "1" }}><Sparkles className="mr-2 h-4 w-4" /> Restart tour</Link></Button><Button variant="outline" size="sm" onClick={() => setMobileOpen((value) => !value)} className="lg:hidden"><Menu className="mr-2 h-4 w-4" /> Topics</Button></div>}
      />
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:sticky lg:top-24 lg:block lg:self-start`} aria-label="Help topics">
          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Topics</CardTitle>
              <div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search help" className="pl-9" aria-label="Search help topics" /></div>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-240px)] overflow-y-auto p-2">
              {HELP_GROUPS.map((group) => {
                const topics = filtered.filter((topic) => topic.group === group);
                if (topics.length === 0) return null;
                return <div key={group} className="mb-3 last:mb-0"><div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">{group}</div><div className="space-y-0.5">{topics.map((topic) => { const active = topic.id === selected.id; return <button key={topic.id} type="button" onClick={() => selectTopic(topic.id)} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${active ? "bg-primary/10 text-foreground ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><BookOpen className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1">{topic.title}</span>{active && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}</button>; })}</div></div>;
              })}
              {filtered.length === 0 && <p className="p-3 text-xs text-muted-foreground">No topics match your search.</p>}
            </CardContent>
          </Card>
        </aside>
        <main className="min-w-0" aria-live="polite"><HelpTopicView topic={selected} /></main>
      </div>
    </div>
  );
}

function HelpTopicView({ topic }: { topic: HelpTopic }) {
  return <article className="space-y-5"><Card className="overflow-hidden"><div className="border-b bg-gradient-to-r from-primary/10 via-card to-card px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{topic.group}</Badge><Badge variant="outline" className="border-success/30 bg-success/5 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Product-aligned guidance</Badge></div><h2 className="mt-3 text-2xl font-semibold tracking-tight">{topic.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{topic.summary}</p></div><CardContent className="space-y-7 p-5 sm:p-7">{topic.sections.map((section) => <HelpSectionView key={section.heading} section={section} />)}{topic.relatedRoutes?.length ? <section><h3 className="text-base font-semibold">Related screens</h3><div className="mt-3 flex flex-wrap gap-2">{topic.relatedRoutes.map((route) => { const href = route.topic ? `/help?topic=${encodeURIComponent(route.topic)}` : route.to; return <Button key={`${route.label}:${href}`} asChild variant="outline" size="sm"><Link to={route.to}>{route.label}{route.to !== href && <ExternalLink className="ml-2 h-3.5 w-3.5" />}</Link></Button>; })}</div></section> : null}</CardContent></Card><Card className="border-primary/20 bg-primary/5"><CardContent className="flex gap-3 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Evidence-first reminder</p><p className="mt-1 text-muted-foreground">When operating in Live mode, treat successful connection, health and synchronization evidence as the boundary for calling provider-backed state current. Approval, execution and verification are separate states.</p></div></CardContent></Card></article>;
}

function HelpSectionView({ section }: { section: HelpTopic["sections"][number] }) {
  return <section><h3 className="text-base font-semibold">{section.heading}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{section.body}</p>{section.bullets?.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{section.bullets.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />{item}</li>)}</ul> : null}{section.steps?.length ? <ol className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">{section.steps.map((item, index) => <li key={item} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-semibold text-foreground">{index + 1}</span><span>{item}</span></li>)}</ol> : null}</section>;
}
