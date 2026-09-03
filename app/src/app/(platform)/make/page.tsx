import "../../explore.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getPageDocument } from "@/lib/pageDocument";
import { MakeForm } from "./MakeForm";

export default async function MakePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/make");

  const stored = getPageDocument(viewer.id);
  // The Make wizard always builds a brand-new document from scratch (see
  // actions.ts's makeFlowAction) — visiting it again after publishing and
  // hitting "Publish your corner" silently wiped an existing page's bio,
  // theme, links, and every other field back to defaults. Once a page is
  // published, editing happens in Studio; Make is a one-time create flow.
  if (stored?.isPublished) redirect("/studio");

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Step 1 of 1 · iofus.example/@{viewer.handle}
      </p>
      <h1>What does your corner of the internet feel like?</h1>
      <p className="make-lead">
        Pick a mood, say who you are, choose what belongs — then publish. Get lost decorating in Studio
        afterward; your imagination is the only limit.
      </p>
      <MakeForm initialDisplayName={stored?.document.identity.displayName ?? viewer.handle} />
    </main>
  );
}
