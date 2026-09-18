import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Search, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_PROVIDER_INSTANCES } from "./provider-instance-limit";
import type { ProviderDefinition } from "./provider-registry";

export type CatalogProvider = ProviderDefinition & {
  configured: boolean;
  connections: Array<{
    id: string;
    display_name: string | null;
    environment: string;
    status: string;
  }>;
};

export function ProviderLogo({ provider, className = "h-10 w-10" }: { provider: CatalogProvider; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-2 ${className}`}>{!failed ? <img src={provider.logoUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(true)} /> : <span className="text-sm font-semibold text-muted-foreground" aria-hidden="true">{provider.name.slice(0, 1)}</span>}</div>;
}

export function ProviderAvailabilityBadge({ provider }: { provider: CatalogProvider }) {
  return provider.availability === "available" ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Available</Badge> : <Badge variant="outline"><Clock3 className="mr-1 h-3 w-3" />Coming soon</Badge>;
}

export function ProviderContractHint({ provider }: { provider: CatalogProvider }) {
  return <span className="text-xs text-muted-foreground">{provider.capabilities.includes("read") && provider.capabilities.includes("sync") ? "Read / sync" : "Catalog only"}</span>;
}

export function CatalogSearch({ value, onChange, placeholder = "Search integrations" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative w-full max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" /></div>;
}

export function filterProviders(providers: CatalogProvider[], query: string, category: string) {
  const q = query.trim().toLowerCase();
  return providers.filter((provider) => (!q || [provider.name, provider.category, provider.description].some((value) => value.toLowerCase().includes(q))) && (!category || provider.category === category));
}

export function ProviderCatalogCard({ provider }: { provider: CatalogProvider }) {
  const available = provider.availability === "available";
  const installedCount = provider.connections.length;
  const atCap = installedCount >= MAX_PROVIDER_INSTANCES;
  return <Card className="flex h-full flex-col transition-colors hover:border-primary/40"><CardHeader className="space-y-4"><div className="flex items-start justify-between gap-3"><ProviderLogo provider={provider} /><div className="flex flex-wrap justify-end gap-2"><Badge variant="secondary">Installed {installedCount}/{MAX_PROVIDER_INSTANCES}</Badge><ProviderAvailabilityBadge provider={provider} /></div></div><div><h3 className="font-semibold tracking-tight">{provider.name}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant="secondary">{provider.category}</Badge><ProviderContractHint provider={provider} /></div></div></CardHeader><CardContent className="flex-1"><p className="text-sm leading-6 text-muted-foreground">{provider.description}</p><div className="mt-4 text-xs text-muted-foreground">Auth: <span className="font-medium text-foreground">{provider.auth}</span></div></CardContent><CardFooter className="flex flex-wrap gap-2 border-t pt-4"><Button asChild size="sm" variant="outline"><Link to="/integrations/catalog/$providerId" params={{ providerId: provider.id }}>Details</Link></Button><Button asChild size="sm" variant="outline"><Link to="/help" search={{ topic: `provider-${provider.id}` }}>Setup guide</Link></Button>{available && !atCap ? <Button asChild size="sm">
  <a href={`/integrations/catalog/${encodeURIComponent(provider.id)}?mode=connect`}>Connect</a>
</Button> : available ? <Button size="sm" variant="outline" disabled>Limit reached</Button> : <Button size="sm" variant="outline" disabled>Coming soon</Button>}</CardFooter></Card>;
}

export function ProviderCatalogGrid({ providers }: { providers: CatalogProvider[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => Array.from(new Set(providers.map((provider) => provider.category))).sort(), [providers]);
  const filtered = useMemo(() => filterProviders(providers, query, category), [providers, query, category]);
  return <div className="space-y-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><CatalogSearch value={query} onChange={setQuery} placeholder="Search by provider, category, or description" /><div className="flex max-w-full gap-2 overflow-x-auto pb-1">{["", ...categories].map((value) => <Button key={value || "all"} type="button" size="sm" variant={category === value ? "default" : "outline"} onClick={() => setCategory(value)} className="shrink-0">{value || "All"}</Button>)}</div></div>{filtered.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map((provider) => <ProviderCatalogCard key={provider.id} provider={provider} />)}</div> : <Card><CardContent className="py-12 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No integrations found</p><p className="mt-1 text-sm text-muted-foreground">Try a different provider, category, or search term.</p></CardContent></Card>}</div>;
}

export function ProviderDetailsHeader({ provider }: { provider: CatalogProvider }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-4"><ProviderLogo provider={provider} className="h-14 w-14" /><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{provider.name}</h1><ProviderAvailabilityBadge provider={provider} /><Badge variant="secondary">Installed {provider.connections.length}/{MAX_PROVIDER_INSTANCES}</Badge></div><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{provider.category}</Badge><Badge variant="outline">{provider.auth}</Badge><ProviderContractHint provider={provider} /></div><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{provider.description}</p></div></div><Button asChild variant="outline"><Link to="/integrations/catalog"><ArrowLeft className="mr-2 h-4 w-4" />Back to catalog</Link></Button></div>;
}

export function CapabilityList({ provider }: { provider: CatalogProvider }) {
  return <div className="grid gap-3 sm:grid-cols-3">{["read", "sync", "write"].map((capability) => { const enabled = provider.capabilities.includes(capability as never); return <div key={capability} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{enabled ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}{capability[0].toUpperCase() + capability.slice(1)}</div><p className="mt-1 text-xs text-muted-foreground">{enabled ? "Declared capability" : "Not declared"}</p></div>; })}</div>;
}
