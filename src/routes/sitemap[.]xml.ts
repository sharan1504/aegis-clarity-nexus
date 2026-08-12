import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://aegis-clarity-nexus.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/agents", changefreq: "weekly", priority: "0.8" },
          { path: "/chat", changefreq: "weekly", priority: "0.7" },
          { path: "/approvals", changefreq: "daily", priority: "0.8" },
          { path: "/integrations", changefreq: "weekly", priority: "0.7" },
          { path: "/marketplace", changefreq: "weekly", priority: "0.7" },
          { path: "/reports", changefreq: "weekly", priority: "0.7" },
          { path: "/resources/what-is-aiops", changefreq: "monthly", priority: "0.8" },
          { path: "/users", changefreq: "monthly", priority: "0.5" },
          { path: "/settings", changefreq: "monthly", priority: "0.4" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
