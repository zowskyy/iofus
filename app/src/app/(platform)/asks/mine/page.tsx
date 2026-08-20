import Link from "next/link";
import { redirect } from "next/navigation";
import { listAnswers, listAsksByUser } from "@/lib/asks";
import { getCurrentUser } from "@/lib/session";
import { closeAskAction } from "../actions";

export default async function MyAsksPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks/mine");

  const asks = listAsksByUser(viewer.id);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Ask Us
      </p>
      <h1>Your asks</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        <Link href="/asks">← Back to Ask Us</Link>
      </p>

      {asks.length === 0 ? (
        <p className="settings-empty">You haven&rsquo;t posted an ask yet.</p>
      ) : (
        <ul className="settings-list">
          {asks.map((ask) => {
            const answers = listAnswers(ask.id);
            const boundClose = closeAskAction.bind(null, ask.id);
            return (
              <li key={ask.id} className="ask-card">
                <div className="ask-meta">
                  <span>{ask.status === "open" ? "Open" : "Closed"}</span>
                  <span>·</span>
                  <span>{answers.length} {answers.length === 1 ? "answer" : "answers"}</span>
                  {ask.domain && <span className="ask-tag">{ask.domain}</span>}
                  {ask.isSensitive && <span className="ask-tag ask-tag-sensitive">Friends only</span>}
                  {ask.isAnonymous && <span className="ask-tag">Anonymous</span>}
                </div>
                <p className="ask-body">{ask.body}</p>

                {answers.length > 0 && (
                  <ul className="ask-answers">
                    {answers.map((answer) => (
                      <li key={answer.id} className="ask-answer">
                        <p className="ask-answer-meta">@{answer.answererHandle}</p>
                        <p className="ask-body">{answer.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {ask.status === "open" && (
                  <form action={boundClose}>
                    <button type="submit" className="btn">
                      Close this ask
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
