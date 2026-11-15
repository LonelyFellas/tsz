import { describe, expect, it, vi } from "vitest";
import type { GenerateVoiceAudioRequest } from "@tsz/types";
import { createAdminEndpoints } from "./admin";
import { HttpError, type HttpClient } from "./http";

function input(text: string): GenerateVoiceAudioRequest {
  return {
    request_id: text,
    source: {
      kind: "text",
      content: { version: 2, text, annotations: [] }
    },
    setting: { voice_id: "sonia", enabled: true, rate_percent: 0 }
  };
}

describe("正式音频生成请求", () => {
  it("连续修改正文时等待后端结束，跳过已取消的中间正文，生成最新正文", async () => {
    let finish!: () => void;
    let running = false;
    const post = vi.fn(
      (
        _path: string,
        request: GenerateVoiceAudioRequest,
        options?: { signal?: AbortSignal }
      ) => {
        if (running)
          return Promise.reject(
            new HttpError(
              409,
              "音频正在生成，请稍后重试",
              [],
              "speech_preview_in_progress"
            )
          );
        running = true;
        return new Promise((resolve, reject) => {
          // 断开 HTTP 不会取消后端任务及账号生成锁。
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true }
          );
          finish = () => {
            running = false;
            resolve({ asset: { id: request.request_id } });
          };
        });
      }
    );
    const api = createAdminEndpoints({ post } as unknown as HttpClient);
    const first = new AbortController();
    const old = api.speech
      .generateAudio(input("h"), first.signal)
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    first.abort();
    const middle = new AbortController();
    const obsolete = api.speech
      .generateAudio(input("hh"), middle.signal)
      .catch((error: unknown) => error);
    middle.abort();
    const latest = api.speech
      .generateAudio(input("hha"))
      .catch((error: unknown) => error);
    await Promise.resolve();
    finish();
    expect(await old).toMatchObject({ name: "AbortError" });
    expect(await obsolete).toMatchObject({ name: "AbortError" });
    await vi.waitFor(() =>
      expect(post.mock.calls.at(-1)?.[1].request_id).toBe("hha")
    );
    finish();
    expect(await latest).toMatchObject({ asset: { id: "hha" } });
    expect(post.mock.calls.map(([, request]) => request.request_id)).toEqual([
      "h",
      "hha"
    ]);
  });

  it("不同编辑器的生成串行执行，前一段失败后仍能继续", async () => {
    let fail!: (error: Error) => void;
    const unavailable = new HttpError(503, "语音服务暂不可用");
    const post = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => (fail = reject))
      )
      .mockResolvedValueOnce({ asset: { id: "other-editor" } });
    const api = createAdminEndpoints({ post } as unknown as HttpClient);
    const first = api.speech
      .generateAudio(input("grammar"))
      .catch((error: unknown) => error);
    const second = api.speech.generateAudio(input("other-editor"));
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    fail(unavailable);
    expect(await first).toBe(unavailable);
    await expect(second).resolves.toEqual({ asset: { id: "other-editor" } });
    expect(post.mock.calls.map(([, request]) => request.request_id)).toEqual([
      "grammar",
      "other-editor"
    ]);
  });

  it("取消尚未发送的生成不会发出 HTTP 请求", async () => {
    const post = vi.fn();
    const api = createAdminEndpoints({ post } as unknown as HttpClient);
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.speech.generateAudio(input("cancelled"), controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(post).not.toHaveBeenCalled();
  });

  it("排队时会话已切换，旧会话内容不会以新账号发出", async () => {
    let generation = 1;
    let finish!: () => void;
    const post = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finish = () => resolve({})))
      )
      .mockResolvedValueOnce({ asset: { id: "new-session" } });
    const api = createAdminEndpoints(
      { post } as unknown as HttpClient,
      () => generation
    );
    const first = api.speech.generateAudio(input("running"));
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    const stale = api.speech
      .generateAudio(input("old-session"))
      .catch((error: unknown) => error);
    generation += 1;
    const current = api.speech.generateAudio(input("new-session"));
    finish();
    await first;
    expect(await stale).toMatchObject({ message: "session changed" });
    await expect(current).resolves.toEqual({ asset: { id: "new-session" } });
    expect(post.mock.calls.map(([, request]) => request.request_id)).toEqual([
      "running",
      "new-session"
    ]);
  });
});
