import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { WordSentenceWritableV3 } from "@tsz/types";
import { V3SentenceTranslationsField } from "./V3SentenceTranslationsField";

const initial: WordSentenceWritableV3 = {
  id: "sentence",
  level: "A1",
  en_text: {
    mode: "unified",
    common: {
      id: "en",
      origin: "manual",
      value: { version: 2, text: "Mother helps me.", annotations: [] }
    }
  },
  zh_text_id: "zh",
  zh_text: { version: 2, text: "旧译文", annotations: [] },
  zh_translations: [
    {
      id: "zh",
      band: "a1_a2",
      content: { version: 2, text: "旧译文", annotations: [] }
    }
  ],
  links: []
};

it("每档可添加多条，改档、编辑、删除以 ID 隔离", async () => {
  const observe = vi.fn();
  function Host() {
    const [sentence, setSentence] = useState(initial);
    return (
      <ConfigProvider theme={{ token: { motion: false } }}>
        <V3SentenceTranslationsField
          sentence={sentence}
          index={0}
          onChange={(rows) => {
            observe(rows);
            setSentence((current) => ({ ...current, zh_translations: rows }));
          }}
        />
      </ConfigProvider>
    );
  }
  render(<Host />);
  expect(
    screen.getByRole("button", { name: "删除例句 1 译文 1" })
  ).toBeDisabled();
  for (const label of [
    "高阶（A1/A2）",
    "中阶（B1/B2）",
    "中阶（B1/B2）",
    "低阶（C1/C2）",
    "低阶（C1/C2）"
  ]) {
    fireEvent.click(screen.getByRole("button", { name: "添加例句 1 译文" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  }
  const before = observe.mock.lastCall![0];
  expect(before.map((row: { band: string }) => row.band)).toEqual([
    "a1_a2",
    "a1_a2",
    "b1_b2",
    "b1_b2",
    "c1_c2",
    "c1_c2"
  ]);
  expect(new Set(before.map((row: { id: string }) => row.id)).size).toBe(6);
  const groups = screen.getAllByRole("group", { name: /译文组$/ });
  expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
    "例句 1 高阶译文组",
    "例句 1 中阶译文组",
    "例句 1 低阶译文组"
  ]);
  expect(
    groups.map((group) => within(group).getAllByRole("textbox").length)
  ).toEqual([2, 2, 2]);
  fireEvent.change(screen.getByLabelText("例句 1 译文 2 中文"), {
    target: { value: "第二条高阶译文" }
  });
  fireEvent.click(screen.getByRole("button", { name: "例句 1 译文 2 等级" }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "低阶（C1/C2）" })
  );
  const changed = observe.mock.lastCall![0];
  expect(
    within(
      screen.getByRole("group", { name: "例句 1 低阶译文组" })
    ).getAllByRole("textbox")
  ).toHaveLength(3);
  expect(changed[1]).toMatchObject({
    id: before[1].id,
    band: "c1_c2",
    content: { text: "第二条高阶译文" }
  });
  expect(changed.filter((_: unknown, i: number) => i !== 1)).toEqual(
    before.filter((_: unknown, i: number) => i !== 1)
  );
  fireEvent.click(screen.getByRole("button", { name: "删除例句 1 译文 2" }));
  expect(observe.mock.lastCall![0]).toEqual(
    before.filter((_: unknown, i: number) => i !== 1)
  );
});

it("保存期间关闭增删、改档及正文编辑", () => {
  render(
    <V3SentenceTranslationsField
      sentence={initial}
      index={0}
      disabled
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("例句 1 中文")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "例句 1 译文 1 等级" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "添加例句 1 译文" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "删除例句 1 译文 1" })
  ).toBeDisabled();
});
