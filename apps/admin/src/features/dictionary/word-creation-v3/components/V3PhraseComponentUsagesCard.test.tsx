import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  DraftFormsStepContentV3,
  PhraseComponentUsageV3
} from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  locateBaseVariant,
  rebuildUsages,
  V3PhraseComponentUsagesCard
} from "./V3PhraseComponentUsagesCard";

const searchComponentTargets = vi.fn();

vi.mock("../api", () => ({
  createV3WordRequests: () => ({
    searchComponentTargets: (input: unknown) => searchComponentTargets(input)
  })
}));

const dialectPreference = { current: "uk" as "uk" | "us" };
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({
    preference: dialectPreference.current,
    savePreference: vi.fn()
  })
}));

type ResolvedUsage = Extract<PhraseComponentUsageV3, { state: "resolved" }>;

function resolvedUsage(overrides: Partial<ResolvedUsage> = {}): ResolvedUsage {
  return {
    state: "resolved",
    id: "usage-1",
    literal: "give",
    target_word_id: "entry-give",
    target_publication_id: "pub-give",
    target_pos_id: "pos-give",
    target_base_form_id: "base-give",
    target_sense_id: "sense-give-1",
    target_form_id: "form-give",
    target_variant_id: "variant-give",
    target_dialect: "common",
    target_form_type: "base",
    target_headword: "give",
    target_gloss: "给；交给",
    ...overrides
  };
}

function selectionOf(usage: ResolvedUsage) {
  const { id: _id, literal: _literal, ...target } = usage;
  return target;
}

/** 英美区分的候选：词形层每种类型有 uk / us 两条，用来验证按偏好只留一侧。 */
function distinguishedColourResponse() {
  return {
    total: 1,
    truncated: false,
    matches: [
      {
        entry_id: "entry-colour",
        publication_id: "pub-colour",
        pos_id: "pos-colour",
        base_form_id: "form-colour-uk",
        headword: "colour",
        kind: "word" as const,
        pos: "noun",
        matched_form_id: "form-colour-uk",
        matched_variant_id: "variant-colour-uk",
        matched_dialect: "uk" as const,
        matched_form_type: "base" as const,
        component_usages: [],
        forms: [
          {
            form_id: "form-colour-uk",
            variant_id: "variant-colour-uk",
            form_type: "base" as const,
            spelling: "colour",
            dialect: "uk" as const,
            base_form_ids: ["form-colour-uk"]
          },
          {
            form_id: "form-colour-us",
            variant_id: "variant-colour-us",
            form_type: "base" as const,
            spelling: "color",
            dialect: "us" as const,
            base_form_ids: ["form-colour-us"]
          }
        ],
        matches: [],
        senses: [
          {
            sense_id: "sense-colour",
            publication_id: "pub-colour",
            pos_id: "pos-colour",
            base_form_id: "form-colour-uk",
            level: "A1",
            gloss: "颜色"
          }
        ]
      }
    ]
  };
}

function makeForms(
  usages: readonly PhraseComponentUsageV3[] = [],
  mode: "common" | "uk_us" = "common"
): DraftFormsStepContentV3 {
  return {
    pos: [
      {
        pos_id: "pos-1",
        pos: "verb",
        dialect_rules: {
          spelling_mode: mode === "common" ? "unified" : "distinguish",
          phonetic_mode: "unified"
        },
        forms: [
          {
            id: "form-base",
            form_type: "base",
            regional_variants:
              mode === "common"
                ? {
                    mode: "common",
                    common: {
                      id: "variant-common",
                      dialect: "common",
                      spelling: "give up",
                      origin: "manual",
                      pronunciations: [],
                      component_usages: [...usages]
                    }
                  }
                : {
                    mode: "uk_us",
                    uk: {
                      id: "variant-uk",
                      dialect: "uk",
                      spelling: "give up",
                      origin: "manual",
                      pronunciations: [],
                      component_usages: [...usages]
                    },
                    us: {
                      id: "variant-us",
                      dialect: "us",
                      spelling: "give up",
                      origin: "manual",
                      pronunciations: []
                    }
                  }
          }
        ],
        form_groups: []
      }
    ]
  };
}

describe("locateBaseVariant", () => {
  it("unified 模式取 common 变体", () => {
    const located = locateBaseVariant(makeForms([resolvedUsage()]), "pos-1");
    expect(located).toMatchObject({
      variantId: "variant-common",
      spelling: "give up",
      dialect: "common"
    });
    expect(located?.usages).toHaveLength(1);
  });

  it("distinguish 模式取 uk 变体", () => {
    const located = locateBaseVariant(makeForms([], "uk_us"), "pos-1");
    expect(located).toMatchObject({ variantId: "variant-uk", dialect: "uk" });
    expect(located?.usages).toEqual([]);
  });

  it("找不到 base 词形时返回 undefined", () => {
    const forms = makeForms();
    forms.pos[0]!.forms[0]!.form_type = "past_tense";
    expect(locateBaseVariant(forms, "pos-1")).toBeUndefined();
    expect(locateBaseVariant(undefined, "pos-1")).toBeUndefined();
  });
});

describe("rebuildUsages", () => {
  const tokens = ["give", "up"];

  it("空存量勾选两条：生成 resolved 条目并带上 literal 与新 id", () => {
    const first = resolvedUsage();
    const second = resolvedUsage({
      target_sense_id: "sense-give-2",
      target_gloss: "举办；提供"
    });
    const next = rebuildUsages([], tokens, "give", [
      selectionOf(first),
      selectionOf(second)
    ]);
    expect(next).toHaveLength(2);
    expect(next.every((usage) => usage.literal === "give")).toBe(true);
    expect(next.every((usage) => usage.state === "resolved")).toBe(true);
    expect(new Set(next.map((usage) => usage.id)).size).toBe(2);
  });

  it("目标不变的条目复用原节点 id", () => {
    const existing = resolvedUsage({ id: "stable-id" });
    const next = rebuildUsages([existing], tokens, "give", [
      selectionOf(existing)
    ]);
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toBe("stable-id");
  });

  it("其他单词的条目原样保留，整体按短语语序排列", () => {
    const upUsage = resolvedUsage({
      id: "usage-up",
      literal: "up",
      target_word_id: "entry-up",
      target_sense_id: "sense-up-1"
    });
    const giveUsage = resolvedUsage();
    const next = rebuildUsages([upUsage], tokens, "give", [
      selectionOf(giveUsage)
    ]);
    expect(next.map((usage) => usage.literal)).toEqual(["give", "up"]);
    expect(next[1]).toBe(upUsage);
  });

  it("取消全部勾选清空该单词条目，其余不动", () => {
    const upUsage = resolvedUsage({
      id: "usage-up",
      literal: "up",
      target_word_id: "entry-up"
    });
    const next = rebuildUsages([resolvedUsage(), upUsage], tokens, "give", []);
    expect(next).toHaveLength(1);
    expect(next[0]!.literal).toBe("up");
  });

  it("同单词的 unresolved 存量保留且排在勾选结果前", () => {
    const unresolved: PhraseComponentUsageV3 = {
      state: "unresolved",
      id: "legacy-unresolved",
      literal: "give"
    };
    const next = rebuildUsages([unresolved], tokens, "give", [
      selectionOf(resolvedUsage())
    ]);
    expect(next.map((usage) => usage.id)).toEqual([
      "legacy-unresolved",
      expect.any(String)
    ]);
  });

  it("不在拼写里的存量 literal 附加在尾部不丢失", () => {
    const stray = resolvedUsage({
      id: "usage-stray",
      literal: "away",
      target_word_id: "entry-away"
    });
    const next = rebuildUsages([stray], tokens, "give", [
      selectionOf(resolvedUsage())
    ]);
    expect(next.map((usage) => usage.literal)).toEqual(["give", "away"]);
  });
});

describe("V3PhraseComponentUsagesCard", () => {
  beforeEach(() => {
    searchComponentTargets.mockReset();
    dialectPreference.current = "uk";
  });

  it("按拼写渲染可点击单词并回显已关联状态", () => {
    const usages = [
      resolvedUsage(),
      resolvedUsage({ id: "usage-2", target_sense_id: "sense-give-2" })
    ];
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms(usages)}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    const giveButton = screen.getByRole("button", {
      name: "关联第 1 个词 give"
    });
    expect(giveButton).toHaveAttribute("aria-pressed", "true");
    expect(giveButton.textContent).toContain("×2");
    expect(
      screen.getByRole("button", { name: "关联第 2 个词 up" })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("2 条")).toBeInTheDocument();
  });

  it("没有 base 词形时显示空态引导", () => {
    const forms = makeForms();
    forms.pos[0]!.forms = [];
    render(
      <V3PhraseComponentUsagesCard
        forms={forms}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    expect(screen.getByText("请先在词形步填写短语拼写")).toBeInTheDocument();
  });

  it("缺少 onFormsChange 时单词按钮禁用", () => {
    render(<V3PhraseComponentUsagesCard forms={makeForms()} posId="pos-1" />);
    expect(
      screen.getByRole("button", { name: "关联第 1 个词 give" })
    ).toBeDisabled();
  });

  it("后端未开启词义查询时提示能力关闭并禁用编辑，不发请求", () => {
    render(
      <V3PhraseComponentUsagesCard
        discoveryEnabled={false}
        forms={makeForms([resolvedUsage()])}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    expect(screen.getByText(/当前后端未开启词义查询能力/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关联第 1 个词 give" })
    ).toBeDisabled();
    expect(searchComponentTargets).not.toHaveBeenCalled();
  });

  it("查询失败时提示错误且不改动已有关联", async () => {
    searchComponentTargets.mockRejectedValueOnce(new Error("offline"));
    const onFormsChange = vi.fn();
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms([resolvedUsage()])}
        onFormsChange={onFormsChange}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    expect(await screen.findByText(/词库查询失败/)).toBeInTheDocument();
    expect(onFormsChange).not.toHaveBeenCalled();
    expect(screen.getByText("1 条")).toBeInTheDocument();
  });

  it("无候选时显示空态", async () => {
    searchComponentTargets.mockResolvedValueOnce({
      matches: [],
      total: 0,
      truncated: false
    });
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms()}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    expect(await screen.findByText("没有匹配的已发布词条")).toBeInTheDocument();
  });

  it("候选没有已发布词义时不产生可勾选节点", async () => {
    searchComponentTargets.mockResolvedValueOnce({
      total: 1,
      truncated: false,
      matches: [
        {
          entry_id: "entry-give",
          publication_id: "pub-give",
          pos_id: "pos-give",
          base_form_id: "base-give",
          headword: "give",
          kind: "word",
          pos: "verb",
          matched_form_id: "form-give",
          matched_variant_id: "variant-give",
          matched_dialect: "common",
          matched_form_type: "base",
          component_usages: [],
          forms: [
            {
              form_id: "form-give",
              variant_id: "variant-give",
              form_type: "base",
              spelling: "give",
              dialect: "common",
              base_form_ids: ["form-give"]
            }
          ],
          matches: [],
          senses: []
        }
      ]
    });
    const onFormsChange = vi.fn();
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms()}
        onFormsChange={onFormsChange}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    expect(await screen.findByText("没有匹配的已发布词条")).toBeInTheDocument();
    expect(onFormsChange).not.toHaveBeenCalled();
  });

  it("候选里查不到的存量关联，勾选其他项时不被静默删除", async () => {
    // 存量指向一个已归档/改版的目标：本次候选里没有它
    const stale = resolvedUsage({
      id: "usage-stale",
      target_word_id: "entry-archived",
      target_sense_id: "sense-archived"
    });
    searchComponentTargets.mockResolvedValueOnce({
      total: 1,
      truncated: false,
      matches: [
        {
          entry_id: "entry-give",
          publication_id: "pub-give",
          pos_id: "pos-give",
          base_form_id: "base-give",
          headword: "give",
          kind: "word",
          pos: "verb",
          matched_form_id: "form-give",
          matched_variant_id: "variant-give",
          matched_dialect: "common",
          matched_form_type: "base",
          component_usages: [],
          forms: [
            {
              form_id: "form-give",
              variant_id: "variant-give",
              form_type: "base",
              spelling: "give",
              dialect: "common",
              base_form_ids: ["form-give"]
            }
          ],
          matches: [],
          senses: [
            {
              sense_id: "sense-give-1",
              publication_id: "pub-give",
              pos_id: "pos-give",
              base_form_id: "base-give",
              level: "A1",
              gloss: "给；交给"
            }
          ]
        }
      ]
    });
    const onFormsChange = vi.fn();
    const { baseElement } = render(
      <V3PhraseComponentUsagesCard
        forms={makeForms([stale])}
        onFormsChange={onFormsChange}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    await waitFor(() =>
      expect(
        baseElement.querySelector(".ant-cascader-menu-item-content")
      ).not.toBeNull()
    );
    fireEvent.click(
      baseElement.querySelector(".ant-cascader-menu-item-content")!
    );
    const formRow = await screen.findByText(/原形 give/);
    fireEvent.click(formRow.closest(".ant-cascader-menu-item-content")!);
    const senseRow = await screen.findByText("给；交给");
    fireEvent.click(
      senseRow
        .closest(".ant-cascader-menu-item")!
        .querySelector(".ant-cascader-checkbox")!
    );
    await waitFor(() => expect(onFormsChange).toHaveBeenCalled());
    const nextForms = onFormsChange.mock.calls.at(
      -1
    )![0] as DraftFormsStepContentV3;
    const variants = nextForms.pos[0]!.forms[0]!.regional_variants;
    const written =
      variants.mode === "common" ? variants.common.component_usages : [];
    expect(written?.map((usage) => usage.id)).toEqual(
      expect.arrayContaining(["usage-stale"])
    );
    expect(written).toHaveLength(2);
  });

  it("拼写改动后落在拼写外的存量关联不计入角标", () => {
    const stray = resolvedUsage({ id: "usage-stray", literal: "away" });
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms([resolvedUsage(), stray])}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    expect(screen.getByText("1 条")).toBeInTheDocument();
  });

  it("点击单词查询候选，勾选词条后把 resolved 条目写回 forms", async () => {
    searchComponentTargets.mockResolvedValue({
      total: 1,
      truncated: false,
      matches: [
        {
          entry_id: "entry-give",
          publication_id: "pub-give",
          pos_id: "pos-give",
          base_form_id: "base-give",
          headword: "give",
          kind: "word",
          pos: "verb",
          matched_form_id: "form-give",
          matched_variant_id: "variant-give",
          matched_dialect: "common",
          matched_form_type: "base",
          component_usages: [],
          forms: [
            {
              form_id: "form-give",
              variant_id: "variant-give",
              form_type: "base",
              spelling: "give",
              dialect: "common",
              base_form_ids: ["form-give"]
            },
            {
              form_id: "form-give-past",
              variant_id: "variant-give-past",
              form_type: "past_tense",
              spelling: "gave",
              dialect: "common",
              base_form_ids: ["base-give"]
            }
          ],
          matches: [],
          senses: [
            {
              sense_id: "sense-give-1",
              publication_id: "pub-give",
              pos_id: "pos-give",
              base_form_id: "base-give",
              level: "A1",
              gloss: "给；交给"
            },
            {
              sense_id: "sense-give-2",
              publication_id: "pub-give",
              pos_id: "pos-give",
              base_form_id: "base-give",
              level: "B1",
              gloss: "举办；提供"
            }
          ]
        }
      ]
    });
    const onFormsChange = vi.fn();
    const { baseElement } = render(
      <V3PhraseComponentUsagesCard
        forms={makeForms()}
        onFormsChange={onFormsChange}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    await waitFor(() =>
      expect(searchComponentTargets).toHaveBeenCalledWith(
        expect.objectContaining({ schema_version: 3, q: "give" })
      )
    );
    // 逐层下钻到词义叶子：父级（词条/词形）不可勾选，只有词义能选
    await waitFor(() =>
      expect(
        baseElement.querySelector(".ant-cascader-menu-item-content")
      ).not.toBeNull()
    );
    fireEvent.click(
      baseElement.querySelector(".ant-cascader-menu-item-content")!
    );
    const formRow = await screen.findByText(/原形 give/);
    fireEvent.click(formRow.closest(".ant-cascader-menu-item-content")!);
    const senseRow = await screen.findByText("给；交给");
    fireEvent.click(
      senseRow
        .closest(".ant-cascader-menu-item")!
        .querySelector(".ant-cascader-checkbox")!
    );
    await waitFor(() => expect(onFormsChange).toHaveBeenCalled());
    const nextForms = onFormsChange.mock.calls.at(
      -1
    )![0] as DraftFormsStepContentV3;
    const variants = nextForms.pos[0]!.forms[0]!.regional_variants;
    const written =
      variants.mode === "common" ? variants.common.component_usages : [];
    // 只写选中的那一个「词形 × 词义」叶子
    expect(written).toHaveLength(1);
    expect(written![0]).toEqual(
      expect.objectContaining({
        state: "resolved",
        literal: "give",
        target_word_id: "entry-give",
        target_sense_id: "sense-give-1",
        target_form_id: "form-give",
        target_variant_id: "variant-give",
        target_form_type: "base",
        target_headword: "give",
        // 发布/词性/原形取自词义自带字段
        target_publication_id: "pub-give",
        target_pos_id: "pos-give",
        target_base_form_id: "form-give"
      })
    );
  });

  it("没有可搭配原形的词形不进候选（V2 目标或未挂变化组）", async () => {
    searchComponentTargets.mockResolvedValue({
      total: 1,
      truncated: false,
      matches: [
        {
          entry_id: "entry-give",
          publication_id: "pub-give",
          pos_id: "pos-give",
          base_form_id: "base-give",
          kind: "word",
          headword: "give",
          pos: "verb",
          matched_form_id: "form-give",
          matched_variant_id: "variant-give",
          matched_dialect: "common",
          matched_form_type: "base",
          component_usages: [],
          matches: [],
          forms: [
            {
              form_id: "form-give",
              variant_id: "variant-give",
              form_type: "base",
              spelling: "give",
              dialect: "common",
              base_form_ids: []
            }
          ],
          senses: [{ sense_id: "sense-give-1", gloss: "给；交给" }]
        }
      ]
    });
    render(
      <V3PhraseComponentUsagesCard
        forms={makeForms()}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    expect(await screen.findByText("没有匹配的已发布词条")).toBeInTheDocument();
  });

  it("候选词形层展示全词形并标注命中行", async () => {
    searchComponentTargets.mockResolvedValue({
      total: 1,
      truncated: false,
      matches: [
        {
          entry_id: "entry-give",
          publication_id: "pub-give",
          pos_id: "pos-give",
          base_form_id: "base-give",
          headword: "give",
          kind: "phrase",
          pos: "verb",
          matched_form_id: "form-give-past",
          matched_variant_id: "variant-give-past",
          matched_dialect: "common",
          matched_form_type: "past_tense",
          component_usages: [],
          forms: [
            {
              form_id: "form-give",
              variant_id: "variant-give",
              form_type: "base",
              spelling: "give",
              dialect: "common",
              base_form_ids: ["form-give"]
            },
            {
              form_id: "form-give-past",
              variant_id: "variant-give-past",
              form_type: "past_tense",
              spelling: "gave",
              dialect: "common",
              base_form_ids: ["base-give"]
            }
          ],
          matches: [
            {
              surface: "give",
              normalized_surface: "give",
              match_kind: "word"
            }
          ],
          senses: [
            {
              sense_id: "sense-give-1",
              publication_id: "pub-give",
              pos_id: "pos-give",
              base_form_id: "base-give",
              level: "A1",
              gloss: "给；交给"
            }
          ]
        }
      ]
    });
    const { baseElement } = render(
      <V3PhraseComponentUsagesCard
        forms={makeForms()}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    await waitFor(() =>
      expect(baseElement.querySelector(".ant-cascader-checkbox")).not.toBeNull()
    );
    // 第一列只展示词面：kind 标签对选择没有帮助，短语候选与单词同构
    expect(
      baseElement.querySelector(".ant-cascader-menu-item-content")!.textContent
    ).toBe("give");
    fireEvent.click(
      baseElement.querySelector(".ant-cascader-menu-item-content")!
    );
    expect(await screen.findByText(/原形 give/)).toBeInTheDocument();
    // 命中行只靠颜色区分：类名在，文案不在。
    const pastRow = await screen.findByText(/过去式 gave/);
    expect(pastRow).toHaveClass("v3-component-usage-matched-form");
    expect(pastRow.closest("li")!.textContent).not.toContain("命中");
    expect(screen.getByText(/原形 give/)).not.toHaveClass(
      "v3-component-usage-matched-form"
    );
  });
  it.each([
    ["uk", "colour", "color"],
    ["us", "color", "colour"]
  ])(
    "方言偏好为 %s 时词形层只给该侧、且不带方言后缀",
    async (preference, shown, hidden) => {
      dialectPreference.current = preference as "uk" | "us";
      searchComponentTargets.mockResolvedValue(distinguishedColourResponse());
      const { baseElement } = render(
        <V3PhraseComponentUsagesCard
          forms={makeForms()}
          onFormsChange={vi.fn()}
          posId="pos-1"
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: "关联第 1 个词 give" })
      );
      await waitFor(() =>
        expect(
          baseElement.querySelector(".ant-cascader-checkbox")
        ).not.toBeNull()
      );
      fireEvent.click(
        baseElement.querySelector(".ant-cascader-menu-item-content")!
      );
      expect(await screen.findByText(`原形 ${shown}`)).toBeInTheDocument();
      expect(screen.queryByText(`原形 ${hidden}`)).toBeNull();
      // 只剩一侧，方言后缀没有区分作用
      expect(baseElement.textContent).not.toContain("BrE");
      expect(baseElement.textContent).not.toContain("AmE");
    }
  );

  it("非偏好侧的存量关联仍出现在词形层，否则解除不了", async () => {
    dialectPreference.current = "uk";
    searchComponentTargets.mockResolvedValue(distinguishedColourResponse());
    const { baseElement } = render(
      <V3PhraseComponentUsagesCard
        forms={makeForms([
          resolvedUsage({
            target_word_id: "entry-colour",
            target_publication_id: "pub-colour",
            target_pos_id: "pos-colour",
            target_base_form_id: "form-colour-us",
            target_sense_id: "sense-colour",
            target_form_id: "form-colour-us",
            target_variant_id: "variant-colour-us",
            target_dialect: "us",
            target_form_type: "base",
            target_headword: "colour"
          })
        ])}
        onFormsChange={vi.fn()}
        posId="pos-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "关联第 1 个词 give" }));
    await waitFor(() =>
      expect(baseElement.querySelector(".ant-cascader-checkbox")).not.toBeNull()
    );
    fireEvent.click(
      baseElement.querySelector(".ant-cascader-menu-item-content")!
    );
    // 偏好是英式，但美式那条已有关联，必须一并列出才能取消勾选
    expect(await screen.findByText("原形 colour")).toBeInTheDocument();
    expect(screen.getByText("原形 color")).toBeInTheDocument();
  });
});
