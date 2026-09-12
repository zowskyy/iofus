import type { MetadataRoute } from "next";
import { listAllPublicHandles } from "@/lib/discovery";

function baseUrl(): string {
  const origin = process.env.IOFUS_ALLOWED_ORIGIN;
  if (origin) return `https://${origin}`;
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const root = baseUrl();
  const profiles = listAllPublicHandles().map(({ handle, updatedAt }) => ({
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
