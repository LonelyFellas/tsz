import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type {
  NextPublication,
  NextPublicationPreview,
  NextPublicationState
} from "@tsz/types";
import { PublicationPanel } from "./PublicationPanel";

const state: NextPublicationState = {
  entry_id: "entry",
  status: "draft",
  lifecycle_revision: 1,
  has_unpublished_changes: true,
  current: null
};
const preview: NextPublicationPreview = {
  entry_id: "entry",
  revision: 2,
  lifecycle_revision: 1,
  preview_token: "a".repeat(64),
  can_publish: true,
  issues: [],
  warnings: [
    {
      node_id: "sense",
      field: "audio_assets",
      message: "缺少音频，本次仅发布文本内容"
    }
  ]
};
const published: NextPublication = {
  id: "publication",
  entry_id: "entry",
  revision: 2,
  lifecycle_revision: 2,
  published_by_admin_id: "actor",
  published_at: "2026-11-16T00:00:00Z",
  snapshot: {
    draft: { schema_version: 1, headword: "centre", forms: [], senses: [] },
    sentence_resources: [],
    relation_targets: []
  }
};
function props() {
  return {
    entryId: "entry",
    revision: 2,
    state,
    loading: false,
    stateError: null,
    dirty: false,
    disabled: false,
    canPublish: true,
    requests: {
      publicationPreview: vi.fn().mockResolvedValue(preview),
      publish: vi.fn().mockResolvedValue(published)
    },
    onBusyChange: vi.fn(),
    onRefresh: vi.fn(),
    onPublished: vi.fn().mockResolvedValue(undefined),
    onConflict: vi.fn()
  };
}
async function check() {
  fireEvent.click(screen.getByRole("button", { name: "检查发布" }));
  await screen.findByRole("button", { name: "确认发布" });
}

describe("新版发布确认", () => {
  it("先检查已保存版本，展示音频提醒，显式确认才发布并回读", async () => {
    const p = props();
    render(<PublicationPanel {...p} />);
    await check();
    expect(p.requests.publicationPreview).toHaveBeenCalledWith("entry", {
      base_revision: 2,
      base_lifecycle_revision: 1
    });
    expect(screen.getByText("音频未就绪，将按文本发布")).toBeVisible();
    expect(screen.getByText("缺少音频，本次仅发布文本内容")).toBeVisible();
    const result = screen.getByRole("region", { name: "发布检查结果" });
    expect(result).toContainElement(
      screen.getByRole("button", { name: "确认发布" })
    );
    await check();
    expect(p.requests.publicationPreview).toHaveBeenCalledTimes(2);
    expect(p.requests.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));
    await waitFor(() => expect(p.onPublished).toHaveBeenCalledWith(published));
    expect(p.requests.publish).toHaveBeenCalledWith(
      "entry",
      expect.objectContaining({
        base_revision: 2,
        base_lifecycle_revision: 1,
        preview_token: preview.preview_token,
        request_id: expect.any(String)
      })
    );
    await waitFor(() => expect(p.onBusyChange).toHaveBeenLastCalledWith(false));
  });
  it("请求未结束时拒绝重复点击，未知结果按原请求重试，回读失败也保持同一身份", async () => {
    const p = props();
    let reject!: (reason: Error) => void;
    p.requests.publish.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    p.onPublished.mockRejectedValueOnce(new Error("read failed"));
    render(<PublicationPanel {...p} />);
    await check();
    const button = screen.getByRole("button", { name: "确认发布" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(p.requests.publish).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("network")));
    fireEvent.click(
      await screen.findByRole("button", { name: "重试确认发布结果" })
    );
    await waitFor(() => expect(p.onPublished).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "重试确认发布结果" })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "重试确认发布结果" }));
    await waitFor(() => expect(p.onPublished).toHaveBeenCalledTimes(2));
    const commands = p.requests.publish.mock.calls.map((call) => call[1]);
    expect(commands).toHaveLength(3);
    expect(
      commands.every(
        (input) => JSON.stringify(input) === JSON.stringify(commands[0])
      )
    ).toBe(true);
  });
  it("草稿变化废弃确认，未保存、无权限或状态读取失败均不能发布", async () => {
    const p = props();
    const view = render(<PublicationPanel {...p} />);
    await check();
    view.rerender(<PublicationPanel {...p} dirty />);
    expect(screen.queryByRole("button", { name: "确认发布" })).toBeNull();
    expect(screen.getByRole("button", { name: "检查发布" })).toBeDisabled();
    view.rerender(<PublicationPanel {...p} canPublish={false} />);
    expect(screen.getByRole("button", { name: "检查发布" })).toBeDisabled();
    view.rerender(<PublicationPanel {...p} stateError={new Error("failed")} />);
    expect(screen.getByRole("button", { name: "检查发布" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(p.onRefresh).toHaveBeenCalledTimes(1);
    expect(p.requests.publish).not.toHaveBeenCalled();
  });
  it("阻塞项禁止确认；版本冲突清除旧令牌并进入比较流程", async () => {
    const p = props();
    p.requests.publicationPreview.mockResolvedValueOnce({
      ...preview,
      can_publish: false,
      issues: [{ node_id: "sense", field: "level", message: "请选择词义等级" }]
    });
    p.requests.publish.mockRejectedValueOnce(
      new HttpError(409, "expired", [], "revision_conflict")
    );
    const locate = vi.fn();
    render(<PublicationPanel {...p} onLocateIssue={locate} />);
    fireEvent.click(screen.getByRole("button", { name: "检查发布" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "请选择词义等级" })
    );
    expect(locate).toHaveBeenCalledWith({
      node_id: "sense",
      field: "level",
      message: "请选择词义等级"
    });
    expect(screen.queryByRole("button", { name: "确认发布" })).toBeNull();
    await check();
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));
    await waitFor(() => expect(p.onConflict).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "确认发布" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "重试确认发布结果" })
    ).toBeNull();
  });
  it("未知结果期间撤销发布权，仍能重试原请求并按服务端拒绝解除锁定", async () => {
    const p = props();
    p.requests.publish.mockRejectedValueOnce(new Error("network"));
    p.requests.publish.mockRejectedValueOnce(
      new HttpError(403, "已撤销发布权限")
    );
    const view = render(<PublicationPanel {...p} />);
    await check();
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));
    await screen.findByText(/发布结果尚未确认/);
    view.rerender(<PublicationPanel {...p} canPublish={false} />);
    fireEvent.click(screen.getByRole("button", { name: "重试确认发布结果" }));
    await screen.findByText("已撤销发布权限");
    expect(p.requests.publish.mock.calls[1]![1]).toEqual(
      p.requests.publish.mock.calls[0]![1]
    );
    await waitFor(() => expect(p.onBusyChange).toHaveBeenLastCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "重试确认发布结果" })
    ).toBeNull();
  });

  it("未知结果重试遇到版本冲突时先回读，已发布则确认原请求完成", async () => {
    const p = props();
    p.requests.publish.mockRejectedValueOnce(new Error("network"));
    p.requests.publish.mockRejectedValueOnce(
      new HttpError(409, "版本已变化", [], "revision_conflict")
    );
    p.onRefresh.mockResolvedValue({
      data: {
        ...state,
        status: "published",
        lifecycle_revision: 2,
        has_unpublished_changes: false,
        current: published
      }
    });
    render(<PublicationPanel {...p} />);
    await check();
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));
    await screen.findByText(/发布结果尚未确认/);
    fireEvent.click(screen.getByRole("button", { name: "重试确认发布结果" }));
    await waitFor(() => expect(p.onPublished).toHaveBeenCalledWith(published));
    expect(p.onRefresh).toHaveBeenCalledTimes(1);
    expect(p.onConflict).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "重试确认发布结果" })
    ).toBeNull();
  });
});
