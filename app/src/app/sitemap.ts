import type { MetadataRoute } from "next";
import { countPublicProfiles, listPublicProfilesPage } from "@/lib/discovery";

// Force runtime evaluation so the sitemap queries the live database, not a
// build-time snapshot (the SQLite volume is not mounted during `next build`).
export const dynamic = "force-dynamic";

// Page 0 carries 2 static routes (/ and /explore) plus profiles; pages 1+ are
// profiles only. Keep every child sitemap within the 50,000-URL protocol limit.
const STATIC_SLOTS = 2;
const MAX_PER_SITEMAP = 50_000;
const PROFILES_PAGE_0 = MAX_PER_SITEMAP - STATIC_SLOTS;

function baseUrl(): string {
  const origin = process.env.IOFUS_ALLOWED_ORIGIN;
  if (origin) return `https://${origin}`;
  return "http://localhost:3000";
}

export function generateSitemaps(): { id: number }[] {
  const total = countPublicProfiles();
  const extraPages = Math.max(0, Math.ceil((total - PROFILES_PAGE_0) / MAX_PER_SITEMAP));
  return Array.from({ length: extraPages + 1 }, (_, i) => ({ id: i }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const pageId = Number(await props.id);
  const root = baseUrl();

  if (pageId === 0) {
    const profiles = listPublicProfilesPage(0, PROFILES_PAGE_0).map(({ handle, updatedAt }) => ({
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

  const offset = PROFILES_PAGE_0 + (pageId - 1) * MAX_PER_SITEMAP;
  return listPublicProfilesPage(offset, MAX_PER_SITEMAP).map(({ handle, updatedAt }) => ({
    url: `${root}/@${handle}`,
    lastModified: updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}
