import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  getRandomPage,
  listByTag,
  listByTemplate,
  listPopularTags,
  listRandomPages,
  listRecentlyPublished,
  searchPages,
} from "./discovery";
import {
  defaultPageDocument,
  savePageDocument,
  setHiddenFromDiscovery,
  setPublished,
  setVisibility,
  type TemplateId,
} from "./pageDocument";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

async function publishPublicPage(
  handle: string,
  displayName: string,
  opts: { tags?: string[]; template?: TemplateId } = {},
) {
  const user = await createUser(handle, "correct-horse-battery");
  const doc = defaultPageDocument(displayName);
  if (opts.template) doc.theme.template = opts.template;
  if (opts.tags) doc.tags = opts.tags;
  savePageDocument(user.id, doc);
  setPublished(user.id, true);
  setVisibility(user.id, "public");
  return user;
}

describe("listRecentlyPublished", () => {
  it("returns only public, published, discoverable pages", async () => {
    await publishPublicPage("visibleone", "Visible One");
    const privateUser = await createUser("privateone", "correct-horse-battery");
    savePageDocument(privateUser.id, defaultPageDocument("Private"));
    setPublished(privateUser.id, true);
    setVisibility(privateUser.id, "private");

    const hidden = await publishPublicPage("hiddenone", "Hidden One");
    setHiddenFromDiscovery(hidden.id, true);

    const pages = listRecentlyPublished();
    expect(pages.map((p) => p.handle)).toEqual(["visibleone"]);
  });
});

describe("listByTag", () => {
  it("finds pages with a matching tag", async () => {
    await publishPublicPage("tagged", "Tagged", { tags: ["cozy", "art"] });
    await publishPublicPage("other", "Other", { tags: ["loud"] });

    const cozy = listByTag("cozy");
    expect(cozy.map((p) => p.handle)).toEqual(["tagged"]);
  });

  it("is case-insensitive on the tag query", async () => {
    await publishPublicPage("tagged", "Tagged", { tags: ["cozy"] });
    expect(listByTag("COZY").length).toBe(1);
  });
});

describe("listByTemplate", () => {
  it("filters recently published pages by template", async () => {
    await publishPublicPage("soft", "Soft", { template: "soft-web" });
    await publishPublicPage("pixel", "Pixel", { template: "pixel-tavern" });

    const soft = listByTemplate("soft-web");
    expect(soft.map((p) => p.handle)).toEqual(["soft"]);
  });
});

describe("listPopularTags", () => {
  it("orders tags by usage count", async () => {
    await publishPublicPage("usercozy", "User Cozy", { tags: ["cozy"] });
    await publishPublicPage("userboth", "User Both", { tags: ["cozy", "art"] });
    await publishPublicPage("userart", "User Art", { tags: ["art"] });

    const tags = listPopularTags();
    expect(tags[0]).toEqual({ tag: "art", count: 2 });
    expect(tags[1]).toEqual({ tag: "cozy", count: 2 });
  });
});

describe("searchPages", () => {
  it("matches handle and document text", async () => {
    await publishPublicPage("neonorchard", "Neon Orchard", { tags: ["retro"] });
    await publishPublicPage("quietroom", "Quiet Room");

    expect(searchPages("neon").map((p) => p.handle)).toEqual(["neonorchard"]);
    expect(searchPages("retro").map((p) => p.handle)).toEqual(["neonorchard"]);
    expect(searchPages("quiet room").map((p) => p.handle)).toEqual(["quietroom"]);
  });

  it("returns empty for blank queries", async () => {
    await publishPublicPage("useralpha", "User Alpha");
    expect(searchPages("")).toEqual([]);
    expect(searchPages("   ")).toEqual([]);
  });
});

describe("listRandomPages", () => {
  it("returns discoverable pages up to the given limit", async () => {
    await publishPublicPage("rp1", "RP One");
    await publishPublicPage("rp2", "RP Two");
    await publishPublicPage("rp3", "RP Three");
    const pages = listRandomPages(2);
    expect(pages).toHaveLength(2);
    const handles = pages.map((p) => p.handle);
    expect(handles.every((h) => ["rp1", "rp2", "rp3"].includes(h))).toBe(true);
  });

  it("returns empty array when no discoverable pages exist", async () => {
    expect(listRandomPages()).toEqual([]);
  });

  it("excludes non-discoverable pages", async () => {
    const hidden = await publishPublicPage("hiddenrp", "Hidden RP");
    setHiddenFromDiscovery(hidden.id, true);
    expect(listRandomPages()).toEqual([]);
  });
});

describe("getRandomPage", () => {
  it("returns a discoverable page when one exists", async () => {
    await publishPublicPage("randompick", "Random Pick");
    const page = getRandomPage();
    expect(page?.handle).toBe("randompick");
  });

  it("returns null when no discoverable pages exist", async () => {
    expect(getRandomPage()).toBeNull();
  });
});
