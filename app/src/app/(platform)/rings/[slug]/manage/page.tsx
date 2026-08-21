import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getWebRingBySlug, listJoinRequests, listRingMembers } from "@/lib/webRings";
import { ManageRingControls } from "./ManageRingControls";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ManageRingPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/rings/${slug}/manage`);

  const ring = getWebRingBySlug(slug);
  if (!ring) notFound();
  if (ring.creatorUserId !== viewer.id) redirect(`/explore/ring/${slug}`);

  const members = listRingMembers(ring.id);
  const requests = listJoinRequests(ring.id, viewer.id);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        <Link href="/rings">Web Rings</Link> / manage
      </p>
      <h1>{ring.name}</h1>
      <ManageRingControls ring={ring!} members={members} requests={requests} />
    </main>
  );
}
