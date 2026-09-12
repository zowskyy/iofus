import type { MetadataRoute } from "next";
import { listAllPublicHandles } from "@/lib/discovery";

// Force runtime evaluation so the sitemap queries the live database, not a
// build-time snapshot (the SQLite volume is not mounted during `next build`).
export const dynamic = "force-dynamic";

const SITEMAP_LIMIT = 50_000;

function baseUrl(): string {
  const origin = process.env.IOFUS_ALLOWED_ORIGIN;
  if (origin) return `https://${origin}`;
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const root = baseUrl();
  const profiles = listAllPublicHandles()
    .slice(0, SITEMAP_LIMIT - 2) // reserve 2 slots for static routes
    .map(({ handle, updatedAt }) => ({
      url: `${root}/@${handle}`,
      lastModified: updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  return [
    { url: root, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${root}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    ...profiles,
  ];
}
