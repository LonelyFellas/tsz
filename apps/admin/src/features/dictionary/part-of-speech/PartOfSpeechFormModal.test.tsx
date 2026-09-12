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
  kind: "word",
  code: "particle",
  name_zh: "小品词",
  name_en: "PARTICLE",
  abbreviation: "part.",
  short_name_zh: "小品词",
  full_name_en: "particle",
  sort_order: 100,
  usage_count: 0,
  sub_part_count: 0,
  sub_parts_extensible: false,
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
      kind={editing?.kind ?? "word"}
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
  it("新增时提交中文名、英文名、缩写、简洁显示、英文全称，编码与排序值由系统补齐", async () => {
    const callbacks = renderModal();
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    expect(screen.queryByText(/已被词条引用/)).toBeNull();
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "小品词" }
    });
    fireEvent.change(screen.getByLabelText("正式英文"), {
      target: { value: "PARTICLE" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "part." }
    });
    fireEvent.change(screen.getByLabelText("简洁显示"), {
      target: { value: "小品词" }
    });
    fireEvent.change(screen.getByLabelText("英文全称"), {
      target: { value: "particle" }
    });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        kind: "word",
        code: "particle",
        name_zh: "小品词",
        name_en: "PARTICLE",
        abbreviation: "part.",
        short_name_zh: "小品词",
        full_name_en: "particle",
        sort_order: 100
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: value.id })
    );
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it("短语侧提交时带上 kind 与 phrase_ 前缀的编码", async () => {
    const onSaved = vi.fn();
    render(
      <PartOfSpeechFormModal
        open
        kind="phrase"
        onClose={vi.fn()}
        onSaved={onSaved}
        onError={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "名词" }
    });
    fireEvent.change(screen.getByLabelText("正式英文"), {
      target: { value: "NOUN" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "n." }
    });
    fireEvent.change(screen.getByLabelText("简洁显示"), {
      target: { value: "名词" }
    });
    fireEvent.change(screen.getByLabelText("英文全称"), {
      target: { value: "noun" }
    });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "phrase", code: "phrase_noun" })
      )
    );
  });

  it("未引用配置修改时不暴露稳定编码，序号可改", async () => {
    const callbacks = renderModal(value);
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    expect(screen.queryByText(/已被词条引用/)).toBeNull();
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "语气词" }
    });
    fireEvent.change(screen.getByLabelText("序号"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("保 存"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        id: "pos-particle",
        input: {
          base_revision: 3,
          name_zh: "语气词",
          name_en: "PARTICLE",
          abbreviation: "part.",
          short_name_zh: "小品词",
          full_name_en: "particle",
          sort_order: 5
        }
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: value.id })
    );
  });

  it("已引用配置修改时同样不暴露稳定编码，也不提示引用", () => {
    renderModal({ ...value, usage_count: 4 });
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    expect(screen.queryByText(/已被词条引用/)).toBeNull();
  });

  it("提交失败保留弹窗并交给页面显示错误", async () => {
    const failure = new Error("conflict");
    api.create.mockRejectedValue(failure);
    const callbacks = renderModal();
    for (const [label, input] of [
      ["正式中文", "小品词"],
      ["正式英文", "PARTICLE"],
      ["英文缩写", "part."],
      ["简洁显示", "小品词"],
      ["英文全称", "particle"]
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

describe("PartOfSpeechFormModal 派生默认值", () => {
  it("新建时简洁显示、英文全称跟随来源字段，手动改过后不再覆盖，编码由英文全称派生", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "小品词" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("简洁显示")).toHaveValue("小品词")
    );

    fireEvent.change(screen.getByLabelText("正式英文"), {
      target: { value: "PARTICLE" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("英文全称")).toHaveValue("particle")
    );
    expect(screen.queryByLabelText("稳定编码")).toBeNull();

    // 手动改过简洁显示后，再改正式中文不再覆盖。
    fireEvent.change(screen.getByLabelText("简洁显示"), {
      target: { value: "小品" }
    });
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "语气词" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("正式中文")).toHaveValue("语气词")
    );
    expect(screen.getByLabelText("简洁显示")).toHaveValue("小品");

    // 英文全称带空格与大小写时，提交的编码折成小写下划线。
    fireEvent.change(screen.getByLabelText("英文全称"), {
      target: { value: "Focus Particle Word" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "part." }
    });
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "focus_particle_word",
          full_name_en: "Focus Particle Word"
        })
      )
    );
  });

  it("新建时序号预填默认值、可改后提交；修改时回填原值且不派生", async () => {
    const view = render(
      <PartOfSpeechFormModal
        open
        kind="word"
        defaultSortOrder={60}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByLabelText("序号")).toHaveValue("60");
    fireEvent.change(screen.getByLabelText("序号"), {
      target: { value: "35" }
    });
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "小品词" }
    });
    fireEvent.change(screen.getByLabelText("正式英文"), {
      target: { value: "PARTICLE" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "part." }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("英文全称")).toHaveValue("particle")
    );
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 35, code: "particle" })
      )
    );
    view.unmount();

    renderModal(value);
    expect(screen.getByLabelText("序号")).toHaveValue("100");
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "语气词" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("正式中文")).toHaveValue("语气词")
    );
    expect(screen.getByLabelText("简洁显示")).toHaveValue("小品词");
  });
});

describe("derivePartOfSpeechCode", () => {
  it("把英文全称折成小写下划线编码，非字母开头时补前缀", async () => {
    const { derivePartOfSpeechCode } = await import("./PartOfSpeechFormModal");
    expect(derivePartOfSpeechCode("noun", "word")).toBe("noun");
    expect(derivePartOfSpeechCode("  Focus Particle-Word  ", "word")).toBe(
      "focus_particle_word"
    );
    expect(derivePartOfSpeechCode("3rd person", "word")).toBe("p_3rd_person");
    expect(derivePartOfSpeechCode("x".repeat(40), "word")).toHaveLength(32);
  });

  it("phrase_ 前缀与短语双向绑定，且不超过 32 字", async () => {
    const { derivePartOfSpeechCode } = await import("./PartOfSpeechFormModal");
    expect(derivePartOfSpeechCode("noun", "phrase")).toBe("phrase_noun");
    // 英文全称本就以 phrase 开头时，短语侧不重复加前缀之外的东西，单词侧必须避开这个命名空间。
    expect(derivePartOfSpeechCode("phrase noun", "phrase")).toBe(
      "phrase_phrase_noun"
    );
    expect(derivePartOfSpeechCode("phrase noun", "word")).toBe("w_phrase_noun");
    expect(derivePartOfSpeechCode("x".repeat(40), "phrase")).toHaveLength(32);
    expect(derivePartOfSpeechCode("x".repeat(40), "phrase")).toMatch(
      /^phrase_/
    );
  });
});
