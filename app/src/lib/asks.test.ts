import { beforeEach, describe, expect, it } from "vitest";
import {
  AskError,
  answerAsk,
  closeAsk,
  createAsk,
  getAsk,
  isReachableForAsks,
  listAnswers,
  listAsksByUser,
  listAsksForViewer,
  setReachableForAsks,
} from "./asks";
import { createUser } from "./auth";
import { blockUser, sendFriendRequest, acceptFriendRequest, listIncomingRequests } from "./friends";
import { RateLimitError } from "./rateLimit";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

/** Creates a default asker and answerer pair for use in tests. */
function twoUsers() {
  const asker = createUser("jamal", "correct-horse-battery");
  const answerer = createUser("priya", "correct-horse-battery");
  return { asker, answerer };
}

/** Sends and immediately accepts a friend request from *aId* to *bId*. */
function befriend(aId: string, bId: string) {
  sendFriendRequest(aId, bId);
  const [req] = listIncomingRequests(bId);
  acceptFriendRequest(bId, req!.id);
}

describe("setReachableForAsks", () => {
  it("defaults to false", () => {
    const { asker } = twoUsers();
    expect(isReachableForAsks(asker.id)).toBe(false);
  });

  it("can be turned on and off", () => {
    const { asker } = twoUsers();
    setReachableForAsks(asker.id, true);
    expect(isReachableForAsks(asker.id)).toBe(true);
    setReachableForAsks(asker.id, false);
    expect(isReachableForAsks(asker.id)).toBe(false);
  });
});

describe("createAsk", () => {
  it("rejects an empty ask", () => {
    const { asker } = twoUsers();
    expect(() => createAsk({ askerId: asker.id, body: "   " })).toThrow(AskError);
  });

  it("rejects an ask over the length limit", () => {
    const { asker } = twoUsers();
    expect(() => createAsk({ askerId: asker.id, body: "x".repeat(2001) })).toThrow(AskError);
  });

  it("creates an open ask with no answers", () => {
    const { asker } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "How do you learn a language fast?" });
    expect(ask.status).toBe("open");
    expect(ask.answerCount).toBe(0);
    expect(ask.askerHandle).toBe("jamal");
  });

  it("hides the asker's handle from non-owners when anonymous", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    const ask = createAsk({ askerId: asker.id, body: "sensitive topic", isAnonymous: true });
    const seenByOwner = getAsk(ask.id, asker.id);
    const seenByOther = getAsk(ask.id, answerer.id);
    expect(seenByOwner?.askerHandle).toBe("jamal");
    expect(seenByOther?.askerHandle).toBeNull();
  });

  it("enforces a daily rate limit per asker", () => {
    const { asker } = twoUsers();
    for (let i = 0; i < 5; i++) {
      createAsk({ askerId: asker.id, body: `ask number ${i}` });
    }
    expect(() => createAsk({ askerId: asker.id, body: "one too many" })).toThrow(RateLimitError);
  });

  it("does not let one asker's rate limit affect another", () => {
    const { asker } = twoUsers();
    const other = createUser("maria", "correct-horse-battery");
    for (let i = 0; i < 5; i++) {
      createAsk({ askerId: asker.id, body: `ask number ${i}` });
    }
    expect(() => createAsk({ askerId: other.id, body: "still fine" })).not.toThrow();
  });
});

describe("listAsksForViewer", () => {
  it("is empty for a viewer who has not opted into reachability", () => {
    const { asker, answerer } = twoUsers();
    createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    expect(listAsksForViewer(answerer.id)).toEqual([]);
  });

  it("shows a non-sensitive ask to a reachable, non-blocked viewer", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    const visible = listAsksForViewer(answerer.id);
    expect(visible.length).toBe(1);
  });

  it("never shows a viewer their own asks", () => {
    const { asker } = twoUsers();
    setReachableForAsks(asker.id, true);
    createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    expect(listAsksForViewer(asker.id)).toEqual([]);
  });

  it("excludes asks from a blocked relationship even if reachable", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    blockUser(answerer.id, asker.id);
    expect(listAsksForViewer(answerer.id)).toEqual([]);
  });

  it("excludes asks from a relationship blocked in the other direction too", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    blockUser(asker.id, answerer.id);
    expect(listAsksForViewer(answerer.id)).toEqual([]);
  });

  it("filters by domain when provided", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    createAsk({ askerId: asker.id, body: "career question", domain: "career" });
    createAsk({ askerId: asker.id, body: "hobby question", domain: "hobbies" });
    const visible = listAsksForViewer(answerer.id, "career");
    expect(visible.length).toBe(1);
    expect(visible[0]!.domain).toBe("career");
  });

  it("does not show a closed ask", () => {
    const { asker, answerer } = twoUsers();
    setReachableForAsks(answerer.id, true);
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    closeAsk(ask.id, asker.id);
    expect(listAsksForViewer(answerer.id)).toEqual([]);
  });

  describe("sensitive asks", () => {
    it("are NOT shown to a reachable stranger, even opted in", () => {
      const { asker, answerer } = twoUsers();
      setReachableForAsks(answerer.id, true);
      createAsk({ askerId: asker.id, body: "mental health question", isSensitive: true });
      expect(listAsksForViewer(answerer.id)).toEqual([]);
    });

    it("ARE shown to the asker's own accepted friend, even without opting into reachability", () => {
      const { asker, answerer } = twoUsers();
      befriend(asker.id, answerer.id);
      createAsk({ askerId: asker.id, body: "mental health question", isSensitive: true });
      const visible = listAsksForViewer(answerer.id);
      expect(visible.length).toBe(1);
      expect(visible[0]!.isSensitive).toBe(true);
    });

    it("stay hidden from a friend who was later blocked", () => {
      const { asker, answerer } = twoUsers();
      befriend(asker.id, answerer.id);
      createAsk({ askerId: asker.id, body: "mental health question", isSensitive: true });
      blockUser(asker.id, answerer.id);
      expect(listAsksForViewer(answerer.id)).toEqual([]);
    });
  });
});

describe("answerAsk", () => {
  it("rejects answering your own ask", () => {
    const { asker } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    expect(() => answerAsk(ask.id, asker.id, "call Bob")).toThrow(AskError);
  });

  it("rejects answering twice from the same person", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    answerAsk(ask.id, answerer.id, "call Bob");
    expect(() => answerAsk(ask.id, answerer.id, "call Bob again")).toThrow(AskError);
  });

  it("rejects an empty answer", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    expect(() => answerAsk(ask.id, answerer.id, "   ")).toThrow(AskError);
  });

  it("rejects answering a closed ask", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    closeAsk(ask.id, asker.id);
    expect(() => answerAsk(ask.id, answerer.id, "call Bob")).toThrow(AskError);
  });

  it("rejects an answer from someone blocked by the asker", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    blockUser(asker.id, answerer.id);
    expect(() => answerAsk(ask.id, answerer.id, "call Bob")).toThrow(AskError);
  });

  it("rejects answering a nonexistent ask", () => {
    const { answerer } = twoUsers();
    expect(() => answerAsk("does-not-exist", answerer.id, "call Bob")).toThrow(AskError);
  });

  it("records a valid answer and increments the ask's answer count", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    answerAsk(ask.id, answerer.id, "call Bob");
    const answers = listAnswers(ask.id);
    expect(answers.length).toBe(1);
    expect(answers[0]!.answererHandle).toBe("priya");
    expect(getAsk(ask.id, asker.id)?.answerCount).toBe(1);
  });

  it("allows multiple different answerers on the same ask", () => {
    const { asker, answerer } = twoUsers();
    const third = createUser("beijing_student", "correct-horse-battery");
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    answerAsk(ask.id, answerer.id, "call Bob");
    answerAsk(ask.id, third.id, "try Alice instead");
    expect(listAnswers(ask.id).length).toBe(2);
  });
});

describe("closeAsk", () => {
  it("rejects closing someone else's ask", () => {
    const { asker, answerer } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    expect(() => closeAsk(ask.id, answerer.id)).toThrow(AskError);
  });

  it("is idempotent when called twice by the owner", () => {
    const { asker } = twoUsers();
    const ask = createAsk({ askerId: asker.id, body: "anyone know a good plumber?" });
    closeAsk(ask.id, asker.id);
    expect(() => closeAsk(ask.id, asker.id)).not.toThrow();
  });

  it("rejects closing a nonexistent ask", () => {
    const { asker } = twoUsers();
    expect(() => closeAsk("does-not-exist", asker.id)).toThrow(AskError);
  });
});

describe("listAsksByUser", () => {
  it("returns all of a user's asks regardless of status", () => {
    const { asker } = twoUsers();
    const a = createAsk({ askerId: asker.id, body: "first ask" });
    createAsk({ askerId: asker.id, body: "second ask" });
    closeAsk(a.id, asker.id);
    expect(listAsksByUser(asker.id).length).toBe(2);
  });

  it("reveals the asker's own handle on their own anonymous ask", () => {
    const { asker } = twoUsers();
    createAsk({ askerId: asker.id, body: "anonymous ask", isAnonymous: true });
    const [ask] = listAsksByUser(asker.id);
    expect(ask!.askerHandle).toBe("jamal");
  });
});
