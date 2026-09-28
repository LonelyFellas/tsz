import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated binary requests", () => {
  it("reads private bytes after refreshing an expired token", async () => {
    let token = "old";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "invalid_token" }), { status: 401 })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/png" }
        })
      );
    vi.stubGlobal("fetch", fetch);
    const http = createHttpClient({
      baseUrl: "/api",
      getToken: () => token,
      onRefresh: async () => (token = "new")
    });
    expect(typeof http.getBlob).toBe("function");
    const blob = await http.getBlob("/private-file");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(blob.type).toBe("image/png");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].headers.get("Authorization")).toBe(
      "Bearer new"
    );
  });

  it("uploads a blob without JSON encoding and returns metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "file-1" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetch);
    const file = new Blob([new Uint8Array([1, 2])], { type: "image/png" });
    const http = createHttpClient({ baseUrl: "/api", getToken: () => "token" });
    expect(typeof http.upload).toBe("function");
    await expect(http.upload("/files", file)).resolves.toEqual({
      id: "file-1"
    });
    expect(fetch.mock.calls[0]![1].body).toBe(file);
    expect(fetch.mock.calls[0]![1].headers.get("Content-Type")).toBe(
      "image/png"
    );
  });

  it("does not return private bytes after the account changes", async () => {
    let generation = 1;
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          })
      )
    );
    const http = createHttpClient({
      baseUrl: "/api",
      getToken: () => "token",
      getSessionGeneration: () => generation
    });
    expect(typeof http.getBlob).toBe("function");
    const pending = http.getBlob("/private-file");
    await Promise.resolve();
    generation += 1;
    resolve(new Response(new Uint8Array([1])));
    await expect(pending).rejects.toThrow("session changed");
  });
});
