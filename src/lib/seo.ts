export const SITE_URL = "https://aegis-clarity-nexus.lovable.app";

interface PageMeta {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}

/** Builds self-referencing, page-specific head metadata for a route. */
export function pageHead({ path, title, description, noindex }: PageMeta) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
