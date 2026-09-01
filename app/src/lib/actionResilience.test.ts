import { describe, expect, it, vi } from "vitest";
import { withNetworkErrorHandling } from "./actionResilience";

interface State {
  error?: string;
  ok?: boolean;
}

describe("withNetworkErrorHandling", () => {
  it("passes through a successful result unchanged", async () => {
    const action = vi.fn(async (_prev: State, _fd: FormData) => ({ ok: true }) as State);
    const wrapped = withNetworkErrorHandling(action);
    const result = await wrapped({}, new FormData());
    expect(result).toEqual({ ok: true });
  });

  it("passes through a domain error result unchanged (not converted to the generic message)", async () => {
    const action = vi.fn(async () => ({ error: "Handle is taken." }) as State);
    const wrapped = withNetworkErrorHandling(action);
    const result = await wrapped({}, new FormData());
    expect(result).toEqual({ error: "Handle is taken." });
  });

  it("converts a thrown network failure into an { error } state instead of propagating the rejection", async () => {
    const action = vi.fn(async (_prev: State, _fd: FormData): Promise<State> => {
      throw new TypeError("Failed to fetch");
    });
    const wrapped = withNetworkErrorHandling(action);
    await expect(wrapped({}, new FormData())).resolves.toEqual({
      error: "Network error — please try again.",
    });
  });

  it("preserves the rest of prevState when converting a thrown failure", async () => {
    type DraftState = State & { draft?: string };
    const action = vi.fn(async (_prev: DraftState, _fd: FormData): Promise<DraftState> => {
      throw new Error("network down");
    });
    const wrapped = withNetworkErrorHandling(action);
    const result = await wrapped({ draft: "unsaved text" }, new FormData());
    expect(result).toEqual({ draft: "unsaved text", error: "Network error — please try again." });
  });

  it("accepts a custom message", async () => {
    const action = vi.fn(async (_prev: State, _fd: FormData): Promise<State> => {
      throw new Error("x");
    });
    const wrapped = withNetworkErrorHandling(action, "Custom failure message.");
    const result = await wrapped({}, new FormData());
    expect(result).toEqual({ error: "Custom failure message." });
  });
});
