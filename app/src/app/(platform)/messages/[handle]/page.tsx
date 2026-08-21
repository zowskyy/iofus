import "../../../messages.css";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { hasBlockRelationship } from "@/lib/friends";
import { listConversations, listMessages, markConversationRead } from "@/lib/messages";
import { parseHandleParam } from "@/lib/handleParam";
import { ThreadComposer } from "./ThreadComposer";

interface Props {
  params: Promise<{ handle: string }>;
}

/** Server page rendering the direct-message thread between the signed-in user and the profile at *handle*. */
export default async function MessageThreadPage({ params }: Props) {
  const { handle: rawParam } = await params;
  // Parse and validate before using in redirect to prevent open redirect via raw param.
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/messages/${handle}`)}`);


  const other = findUserByHandle(handle);
  if (!other) notFound();
  if (other.id === viewer.id) redirect("/messages");

  const blocked = hasBlockRelationship(viewer.id, other.id);

  const conversations = listConversations(viewer.id);
  const conversation = conversations.find((c) => c.otherUserId === other.id) ?? null;

  let messages: ReturnType<typeof listMessages> = [];
  if (conversation) {
    messages = listMessages(conversation.id, viewer.id);
    markConversationRead(conversation.id, viewer.id);
  }

  return (
    <main className="container">
      <div className="msg-thread-header">
        <Link href="/messages" className="msg-back">
          ← Back
        </Link>
        <h1>{handle}</h1>
      </div>
      {blocked ? (
        <p className="msg-empty">You can&apos;t message this person.</p>
      ) : (
        <>
          <div className="msg-thread">
            {messages.length === 0 ? (
              <p className="msg-empty">No messages yet. Say hi.</p>
            ) : (
              messages.map((m) => (
                <p key={m.id} className={m.senderId === viewer.id ? "msg-line msg-line-mine" : "msg-line"}>
                  <span className="msg-sender">{m.senderId === viewer.id ? viewer.handle : handle}:</span>{" "}
                  {m.body}
                </p>
              ))
            )}
          </div>
          <ThreadComposer recipientHandle={handle} />
        </>
      )}
    </main>
  );
}
