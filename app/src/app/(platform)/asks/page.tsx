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
      <h1>Ask the community</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Post a question — skill, knowledge, perspective. Reach people outside your circle who actually opt in to help.
        Not a DM inbox. Not broadcast into the void.{" "}
        <Link href="/asks/mine">Your asks →</Link>
      </p>

      <section className="settings-section" aria-label="Reachability">
        <h2>In the pool</h2>
        {reachable ? (
          <p style={{ color: "var(--moss)", margin: "0 0 0.75rem" }}>
            You&rsquo;re in — you can see and answer other members&rsquo; asks, and they can answer yours.
          </p>
        ) : (
          <p className="settings-empty" style={{ marginBottom: "0.75rem" }}>
            You&rsquo;re out of the pool. Turn this on to join the exchange — see asks, answer them, get answers back.
            Off by default. Flip it back off whenever you want.
          </p>
        )}
        <form action={toggleAction}>
          <button type="submit" className="btn">
            {reachable ? "Leave the pool" : "Join the pool"}
          </button>
        </form>
      </section>

      <AskForm />

      <section aria-label="Open asks">
        <h2>Open asks</h2>
        {asks.length === 0 ? (
          <p className="settings-empty">
            {reachable
              ? "Nothing open right now — check back, or drop one of your own above."
              : "Join the pool above to see what's being asked."}
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
