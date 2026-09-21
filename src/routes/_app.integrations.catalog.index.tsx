import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { getProviderCatalog } from "@/lib/integrations/provider-functions";
import { ProviderCatalogGrid } from "@/lib/integrations/integrations-catalog-ui";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/integrations/catalog/")({
  loader: async () => getProviderCatalog(),
  head: () =>
    pageHead({
      path: "/integrations/catalog",
      title: "Integration Catalog — CenOps",
      description: "Browse and install enterprise integrations.",
    }),
  component: IntegrationCatalogPage,
});

function IntegrationCatalogPage() {
  const { providers } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integration catalog"
        description="Browse available connectors and choose the provider you want to install."
        actions={
          <Button asChild variant="outline">
            <Link to="/integrations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Installed integrations
            </Link>
          </Button>
        }
      />
      <ProviderCatalogGrid providers={providers} />
    </div>
  );
}
