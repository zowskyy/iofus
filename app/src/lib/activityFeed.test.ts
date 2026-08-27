import { beforeEach, describe, expect, it } from "vitest";
import { getFriendActivityFeed } from "./activityFeed";
import { createUser } from "./auth";
import { blockUser, sendFriendRequest } from "./friends";
import { signGuestbook } from "./guestbook";
import { defaultPageDocument, savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function befriend(aId: string, bId: string): void {
  sendFriendRequest(aId, bId);
  sendFriendRequest(bId, aId); // auto-accepts, matching how the UI drives it
}

function publish(userId: string, displayName: string): void {
  savePageDocument(userId, defaultPageDocument(displayName));
  setPublished(userId, true);
}

describe("getFriendActivityFeed", () => {
  it("does not leak a friend's page-decorated activity once they go private", () => {
    const viewer = createUser("voidarcade", "correct-horse-battery");
    const friend = createUser("neonorchard", "correct-horse-battery");
    publish(viewer.id, "Void Arcade");
    publish(friend.id, "Neon Orchard");
    befriend(viewer.id, friend.id);
    setVisibility(friend.id, "private");

    const items = getFriendActivityFeed(viewer.id);
    expect(items.some((i) => i.actorHandle === "neonorchard")).toBe(false);
  });

  it("does not leak a blocked friend's activity", () => {
    const viewer = createUser("voidarcade", "correct-horse-battery");
    const friend = createUser("neonorchard", "correct-horse-battery");
    publish(viewer.id, "Void Arcade");
    publish(friend.id, "Neon Orchard");
    befriend(viewer.id, friend.id);
    blockUser(viewer.id, friend.id);

    const items = getFriendActivityFeed(viewer.id);
    expect(items.some((i) => i.actorHandle === "neonorchard")).toBe(false);
  });

  it("does not leak a private target's identity through a friend's guestbook activity", () => {
    const viewer = createUser("voidarcade", "correct-horse-battery");
    const friend = createUser("neonorchard", "correct-horse-battery");
    const target = createUser("privateuser", "correct-horse-battery");
    publish(viewer.id, "Void Arcade");
    publish(friend.id, "Neon Orchard");
    publish(target.id, "Private User");
    setVisibility(target.id, "private");
    befriend(viewer.id, friend.id);

    signGuestbook(target.id, friend.id, "neonorchard", "hi!", false);

    const items = getFriendActivityFeed(viewer.id);
    expect(items.some((i) => i.kind === "guestbook_signed" && i.targetHandle === "privateuser")).toBe(false);
  });

  it("does not leak a guestbook target's identity when the viewer has blocked them", () => {
    const viewer = createUser("voidarcade", "correct-horse-battery");
    const friend = createUser("neonorchard", "correct-horse-battery");
    const target = createUser("blockeduser", "correct-horse-battery");
    publish(viewer.id, "Void Arcade");
    publish(friend.id, "Neon Orchard");
    publish(target.id, "Blocked User");
    setVisibility(target.id, "public");
    befriend(viewer.id, friend.id);
    blockUser(viewer.id, target.id);

    signGuestbook(target.id, friend.id, "neonorchard", "hi!", false);

    const items = getFriendActivityFeed(viewer.id);
    expect(items.some((i) => i.kind === "guestbook_signed" && i.targetHandle === "blockeduser")).toBe(false);
  });

  it("still shows ordinary public activity between friends", () => {
    const viewer = createUser("voidarcade", "correct-horse-battery");
    const friend = createUser("neonorchard", "correct-horse-battery");
    publish(viewer.id, "Void Arcade");
    publish(friend.id, "Neon Orchard");
    setVisibility(friend.id, "public");
    befriend(viewer.id, friend.id);

    const items = getFriendActivityFeed(viewer.id);
    expect(items.some((i) => i.actorHandle === "neonorchard" && i.kind === "page_decorated")).toBe(true);
  });
});
