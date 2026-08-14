import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PartOfSpeechConfig } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartOfSpeechFormModal } from "./PartOfSpeechFormModal";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  createPending: false,
  updatePending: false
}));

vi.mock("./api", () => ({
  useCreatePartOfSpeech: () => ({
    mutateAsync: api.create,
    isPending: api.createPending
  }),
  useUpdatePartOfSpeech: () => ({
    mutateAsync: api.update,
    isPending: api.updatePending
  })
}));

const value: PartOfSpeechConfig = {
  id: "pos-particle",
  code: "particle",
  name_zh: "小品词",
  name_en: "PARTICLE",
  abbreviation: "part.",
  sort_order: 100,
  usage_count: 0,
  sub_part_count: 0,
  revision: 3,
  created_by: { id: "admin-1", display_name: "管理员" },
  created_at: "2026-08-08T00:00:00.000Z",
  updated_at: "2026-08-08T00:00:00.000Z"
};

function renderModal(editing?: PartOfSpeechConfig) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onError = vi.fn();
  render(
    <PartOfSpeechFormModal
      open
      value={editing}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
    />
  );
  return { onClose, onSaved, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createPending = false;
  api.updatePending = false;
  api.create.mockResolvedValue(value);
  api.update.mockResolvedValue({ ...value, revision: 4 });
});

describe("PartOfSpeechFormModal", () => {
  it("新增时校验并提交稳定编码、中文名、英文名、缩写和排序", async () => {
    const callbacks = renderModal();
    fireEvent.change(screen.getByLabelText("稳定编码"), {
      target: { value: "particle" }
    });
    fireEvent.change(screen.getByLabelText("基本词性中文"), {
      target: { value: "小品词" }
    });
    fireEvent.change(screen.getByLabelText("基本词性英文"), {
      target: { value: "PARTICLE" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "part." }
    });
    fireEvent.change(screen.getByLabelText("排序值"), {
      target: { value: "30" }
    });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        code: "particle",
        name_zh: "小品词",
        name_en: "PARTICLE",
        abbreviation: "part.",
        sort_order: 30
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith(value.id);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it("修改时稳定编码只读，并携带当前 revision", async () => {
    const callbacks = renderModal(value);
    expect(screen.getByLabelText("稳定编码")).toBeDisabled();
    expect(
      screen.getByText("编码已被词条引用，创建后不可修改。")
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("基本词性中文"), {
      target: { value: "语气词" }
    });
    fireEvent.click(screen.getByText("保 存"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        id: "pos-particle",
        input: {
          base_revision: 3,
          name_zh: "语气词",
          name_en: "PARTICLE",
          abbreviation: "part.",
          sort_order: 100
        }
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith(value.id);
  });

  it("提交失败保留弹窗并交给页面显示错误", async () => {
    const failure = new Error("conflict");
    api.create.mockRejectedValue(failure);
    const callbacks = renderModal();
    for (const [label, input] of [
      ["稳定编码", "particle"],
      ["基本词性中文", "小品词"],
      ["基本词性英文", "PARTICLE"],
      ["英文缩写", "part."]
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: input }
      });
    }
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith(failure)
    );
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it("pending 状态显示提交 loading", () => {
    api.createPending = true;
    renderModal();
    expect(screen.getByText("新 建").closest("button")).toHaveClass(
      "ant-btn-loading"
    );
  });

  it("取消调用关闭", () => {
    const callbacks = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "取 消" }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });
});
