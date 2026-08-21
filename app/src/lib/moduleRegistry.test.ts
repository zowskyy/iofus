import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { PAGE_MODULE_REGISTRY, renderPagePart } from "./moduleRegistry";
import { defaultPageDocument } from "./pageDocument";

describe("PAGE_MODULE_REGISTRY", () => {
  it("includes all Phase 5 modules", () => {
    expect(PAGE_MODULE_REGISTRY.shrine).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.playlist).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.pixelArt).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.miniPages).toBeDefined();
  });

  it("renders unsupported module without crashing", () => {
    const doc = defaultPageDocument("Test");
    const node = renderPagePart("unknown-module-xyz", {
      document: doc,
      handle: "test",
      readerMode: false,
      friends: [],
      guestbookEntries: [],
      topEightLinks: [],
    });
    expect(node).not.toBeNull();
  });
});

describe("identity module status marquee", () => {
  /** Builds a minimal render context with a status line and the given *marqueeStatus* setting. */
  function ctxWithStatus(marqueeStatus: boolean) {
    const doc = defaultPageDocument("Test");
    doc.identity.status = "listening to blink-182";
    doc.theme.marqueeStatus = marqueeStatus;
    return {
      document: doc,
      handle: "test",
      readerMode: false,
      friends: [],
      guestbookEntries: [],
      topEightLinks: [],
    };
  }

  it("renders a plain status paragraph when marqueeStatus is off", () => {
    const node = renderPagePart("identity", ctxWithStatus(false)) as ReactElement<{
      children: ReactElement[];
    }>;
    const statusP = node.props.children[1] as ReactElement<{ className: string; children: string }>;
    expect(statusP.props.className).toBe("page-status");
    expect(statusP.props.children).toBe("listening to blink-182");
  });

  it("wraps the status in a scrolling span when marqueeStatus is on", () => {
    const node = renderPagePart("identity", ctxWithStatus(true)) as ReactElement<{
      children: ReactElement[];
    }>;
    const statusP = node.props.children[1] as ReactElement<{
      className: string;
      children: ReactElement<{ children: string }>;
    }>;
    expect(statusP.props.className).toBe("page-status marquee");
    expect(statusP.props.children.type).toBe("span");
    expect(statusP.props.children.props.children).toBe("listening to blink-182");
  });

  it("renders nothing for status when the member never set one", () => {
    const doc = defaultPageDocument("Test");
    doc.theme.marqueeStatus = true;
    const node = renderPagePart("identity", {
      document: doc,
      handle: "test",
      readerMode: false,
      friends: [],
      guestbookEntries: [],
      topEightLinks: [],
    }) as ReactElement<{ children: ReactElement[] }>;
    expect(node.props.children[1]).toBeFalsy();
  });
});
