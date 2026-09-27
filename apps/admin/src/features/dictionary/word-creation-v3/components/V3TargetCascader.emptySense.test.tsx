import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublishedSentenceTargetCandidateV3 } from "@tsz/types";
import { V3TargetCascader } from "./V3TargetCascader";

const search = vi.fn();
vi.mock("../api", () => ({
  createV3WordRequests: () => ({ searchComponentTargets: search })
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));

function candidate(glosses: string[]): PublishedSentenceTargetCandidateV3 {
  return {
    entry_id: "some",
    headword: "some",
    kind: "word",
    pos: "adverb",
    pos_id: "adverb",
    base_form_id: "base",
    matched_form_id: "base",
    matched_variant_id: "common",
    matched_dialect: "common",
    matched_form_type: "base",
    matches: [],
    component_usages: [],
    forms: [
      {
        form_id: "base",
        variant_id: "common",
        form_type: "base",
        dialect: "common",
        spelling: "some",
        base_form_ids: ["base"]
      }
    ],
    senses: glosses.map((gloss, i) => ({
      sense_id: `sense-${i}`,
      pos_id: "adverb",
      base_form_id: "base",
      level: "A1",
      gloss
    }))
  };
}

beforeEach(() => search.mockReset());

async function renderUnselected(onReplace: () => void) {
  // 候选请求完成后才挂载 Panel；先等待挂载 effect（初始展开路径）提交，
  // 避免只等文字出现就点击，随后被初始化 effect 重置展开状态。
  await act(async () => {
    render(
      <V3TargetCascader literal="some" targets={[]} onReplace={onReplace} />
    );
  });
}

it("新选时隐藏空字符串和纯空白词义，正常词义仍可选择", async () => {
  search.mockResolvedValue({
    matches: [candidate(["一些", "", "  \n "])],
    truncated: false
  });
  const onReplace = vi.fn();
  await renderUnselected(onReplace);
  fireEvent.click(screen.getByText("some"));
  fireEvent.click(await screen.findByText("原形 some"));
  expect(document.querySelectorAll(".v3-component-usage-sense")).toHaveLength(
    1
  );
  expect(screen.queryByText("词义未填写")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("一些"));
  expect(onReplace).toHaveBeenCalledWith(
    [expect.objectContaining({ target_sense_id: "sense-0" })],
    undefined
  );
});

it.each([false, true])(
  "已有空白词义仅回显且禁用（readOnly=%s）",
  async (readOnly) => {
    search.mockResolvedValue({
      matches: [candidate(["一些", "", "  "])],
      truncated: false
    });
    const onReplace = vi.fn();
    render(
      <V3TargetCascader
        literal="some"
        targets={[]}
        onReplace={onReplace}
        readOnly={readOnly}
        selectedTarget={{
          target_word_id: "some",
          target_pos_id: "adverb",
          target_form_id: "base",
          target_variant_id: "common",
          target_sense_id: "sense-1"
        }}
      />
    );
    const label = await screen.findByText("词义未填写");
    expect(label.querySelector(".is-checked")).not.toBeNull();
    expect(label.closest("li")).toHaveClass("ant-cascader-menu-item-disabled");
    fireEvent.click(label);
    expect(onReplace).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".v3-component-usage-sense")).toHaveLength(
      2
    );
    expect(screen.queryByText("暂无释义")).not.toBeInTheDocument();
  }
);

it("全部词义为空时禁用词形，不产生可选空白叶子", async () => {
  search.mockResolvedValue({
    matches: [candidate(["", "  "])],
    truncated: false
  });
  const onReplace = vi.fn();
  await renderUnselected(onReplace);
  fireEvent.click(screen.getByText("some"));
  const form = await screen.findByText("原形 some（暂无可关联词义）");
  expect(form.closest("li")).toHaveClass("ant-cascader-menu-item-disabled");
  fireEvent.click(form);
  expect(onReplace).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".v3-component-usage-sense")).toHaveLength(
    0
  );
});
