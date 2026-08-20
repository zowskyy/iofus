import Link from "next/link";
import { redirect } from "next/navigation";
import { isReachableForAsks, listAnswers, listAsksForViewer } from "@/lib/asks";
import { getCurrentUser } from "@/lib/session";
import { setReachableAction } from "./actions";
import { AskCard } from "./AskCard";
import { AskForm } from "./AskForm";

/** Server page rendering the public Ask Us pool, with the ask form for signed-in users. */
export default async function AsksPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks");

  const reachable = isReachableForAsks(viewer.id);
  const asks = listAsksForViewer(viewer.id);
  const toggleAction = setReachableAction.bind(null, !reachable);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Ask Us
      </p>
      <h1>Reach beyond who you already know</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        A structured, rate-limited way to ask for help, knowledge, or perspective you don&rsquo;t already
        have access to — never a DM inbox, never addressed to anyone specific.{" "}
        <Link href="/asks/mine">See your own asks →</Link>
      </p>

      <section className="settings-section" aria-label="Reachability">
        <h2>Reachability</h2>
        {reachable ? (
          <p style={{ color: "var(--moss)", margin: "0 0 0.75rem" }}>
            You&rsquo;re reachable — your open, non-sensitive asks are answerable by other reachable
            members, and you can see and answer theirs.
          </p>
        ) : (
          <p className="settings-empty" style={{ marginBottom: "0.75rem" }}>
            You&rsquo;re not reachable — turn this on to see and answer other members&rsquo; asks, and to
            let them answer yours. Off by default; you can turn it off again anytime.
          </p>
        )}
        <form action={toggleAction}>
          <button type="submit" className="btn">
            {reachable ? "Turn off reachability" : "Turn on reachability"}
          </button>
        </form>
      </section>

      <AskForm />

      <section aria-label="Open asks">
        <h2>Asks you can answer</h2>
        {asks.length === 0 ? (
          <p className="settings-empty">
            {reachable
              ? "No open asks right now — check back later, or post one of your own above."
              : "Turn on reachability above to see open asks from other members."}
          </p>
        ) : (
          <ul className="settings-list">
            {asks.map((ask) => (
              <AskCard key={ask.id} ask={ask} answers={listAnswers(ask.id)} viewerId={viewer.id} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
