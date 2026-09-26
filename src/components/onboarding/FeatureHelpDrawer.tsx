import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HELP_TOPIC_BY_ID, type HelpTopic } from "@/lib/help/content";

function pickSection(topic: HelpTopic, names: string[]) {
  return topic.sections.find((section) => names.some((name) => section.heading.toLowerCase().includes(name)));
}

export function FeatureHelpDrawer({
  topicId,
  open,
  onOpenChange,
}: {
  topicId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const topic = topicId ? HELP_TOPIC_BY_ID[topicId] : undefined;
  if (!topic) return null;

  const what = pickSection(topic, ["what it is", "what this is"]);
  const use = pickSection(topic, ["use cases", "when to use"]);
  const prerequisites = pickSection(topic, ["prerequisites"]);
  const steps = pickSection(topic, ["step-by-step", "how it works"]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            {topic.title}
          </SheetTitle>
          <SheetDescription>{topic.summary}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {what && (
            <section>
              <h3 className="text-sm font-semibold">What this is</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{what.body}</p>
            </section>
          )}
          {use && (
            <section>
              <h3 className="text-sm font-semibold">When to use it</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{use.body}</p>
              {use.bullets?.length ? (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {use.bullets.slice(0, 4).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{item}</li>)}
                </ul>
              ) : null}
            </section>
          )}
          {prerequisites && (
            <section>
              <h3 className="text-sm font-semibold">What you need</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{prerequisites.body}</p>
            </section>
          )}
          {steps && (
            <section>
              <h3 className="text-sm font-semibold">How to try it</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{steps.body}</p>
              {steps.bullets?.length ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  {steps.bullets.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                </ol>
              ) : null}
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {(topic.relatedRoutes ?? []).slice(0, 2).map((route) => (
              <Button key={route.to} asChild size="sm">
                <Link to={route.to as never}>{route.label}</Link>
              </Button>
            ))}
            <Button asChild size="sm" variant="outline">
              <Link to="/help" search={{ topic: topic.id }}>
                <BookOpen className="mr-1.5 h-4 w-4" />
                Open Help topic
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function FeatureHelpButton({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg px-2.5 text-xs"
        onClick={() => setOpen(true)}
        title="Explain this feature"
      >
        <Info className="mr-1.5 h-3.5 w-3.5" />
        Explain
      </Button>
      <FeatureHelpDrawer topicId={topicId} open={open} onOpenChange={setOpen} />
    </>
  );
}
