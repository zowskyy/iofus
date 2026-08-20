import type { Answer, Ask } from "@/lib/asks";
import { AnswerForm } from "./AnswerForm";

/** Formats an ISO date string as a short locale date for display in ask cards. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Renders a single ask with its answers and, for the page owner, an answer form. */
export function AskCard({
  ask,
  answers,
  viewerId,
  showAnswerForm = true,
}: {
  ask: Ask;
  answers: Answer[];
  viewerId: string;
  showAnswerForm?: boolean;
}) {
  const alreadyAnswered = answers.some((a) => a.answererId === viewerId);

  return (
    <li className="ask-card">
      <div className="ask-meta">
        <span>{ask.askerHandle ? `@${ask.askerHandle}` : "Anonymous"}</span>
        <span>·</span>
        <span>{formatDate(ask.createdAt)}</span>
        {ask.domain && <span className="ask-tag">{ask.domain}</span>}
        {ask.isSensitive && <span className="ask-tag ask-tag-sensitive">Friends only</span>}
        {ask.status === "closed" && <span className="ask-tag">Closed</span>}
      </div>
      <p className="ask-body">{ask.body}</p>

      {answers.length > 0 && (
        <ul className="ask-answers">
          {answers.map((answer) => (
            <li key={answer.id} className="ask-answer">
              <p className="ask-answer-meta">
                @{answer.answererHandle} · {formatDate(answer.createdAt)}
              </p>
              <p className="ask-body">{answer.body}</p>
            </li>
          ))}
        </ul>
      )}

      {showAnswerForm && ask.status === "open" && !alreadyAnswered && <AnswerForm askId={ask.id} />}
    </li>
  );
}
