import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import {
  fireEvent,
  isInaccessible,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";

import type { AdminSpeechVoice, AdminSpeechVoiceMetadata } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { VoiceCatalogTable } from "./VoiceCatalogTable";

const metadata: AdminSpeechVoiceMetadata = {
  provider_voice_id: "en-GB-SoniaNeural",
  model: "neural",
  age_group: "Adult",
  description: "A gentle and soft voice.",
  personalities: ["Gentle", "Soft"],
  scenarios: ["Narration", "News"],
  roles: [],
  source_url: "https://speech.microsoft.com/portal/voicegallery",
  checked_at: "2026-10-25T13:03:39Z"
};
const sonia: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "female",
  is_common: true,
  metadata,
  capabilities: {
    styles: ["cheerful"],
    min_rate_percent: -50,
    max_rate_percent: 100,
    min_pitch_semitones: -12,
    max_pitch_semitones: 12
  }
};
const voices: AdminSpeechVoice[] = [
  sonia,
  {
    ...sonia,
    alias: "ana",
    display_name: "Ana",
    locale: "en-US",
    is_common: false,
    metadata: {
      ...metadata,
      provider_voice_id: "en-US-AnaNeural",
      age_group: "Child",
      scenarios: ["Audiobook", "Narration"],
      personalities: ["Curious"]
    }
  },
  {
    ...sonia,
    alias: "ava",
    display_name: "Ava",
    locale: "en-US",
    metadata: {
      ...metadata,
      provider_voice_id: "en-US-AvaMultilingualNeural",
      model: "multilingual",
      age_group: "YoungAdult",
      scenarios: ["News"],
      roles: ["YoungAdultFemale"]
    }
  },
  {
    ...sonia,
    alias: "unknown",
    display_name: "Unknown",
    gender: "",
    metadata: undefined
  }
];
function mount(items = voices) {
  return render(
    <VoiceCatalogTable
      voices={items}
      metadata={
        new Map([
          [
            "sonia",
            {
              voice_alias: "sonia",
              description_zh: "共享介绍",
              description_revision: 2,
              notes: "适合慢读",
              personal_revision: 3,
              parameters: null
            }
          ]
        ])
      }
      loading={false}
      settingsPending={false}
      canGenerate
      validText
      pendingVoice={null}
      onAudition={vi.fn()}
      onDetails={vi.fn()}
    />
  );
}
function names(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("tbody button[aria-label^='试听 ']")
  ).map((node) => node.getAttribute("aria-label")!.slice(3));
}
// AntD 为测量列宽复制了隐藏表头；只检查已命中的控件，避免全表计算角色名称。
function visibleControl(label: string) {
  const matches = screen
    .getAllByLabelText(label)
    .filter((node) => !isInaccessible(node));
  expect(matches).toHaveLength(1);
  return matches[0]!;
}
function resetFilters() {
  const header = screen.getByRole("columnheader", { name: /^操作/ });
  fireEvent.click(within(header).getByRole("button", { name: "清除筛选" }));
}
async function select(label: string, option: string) {
  if (
    label === "音色排序" &&
    !screen.queryAllByLabelText(label).some((node) => !isInaccessible(node))
  ) {
    fireEvent.click(visibleControl("音色筛选和排序"));
  }
  const input = await waitFor(() => visibleControl(label));
  fireEvent.mouseDown(input);
  const content = await waitFor(() => {
    const match = Array.from(
      document.querySelectorAll(
        ".ui-select-dropdown:not(.ui-select-dropdown-hidden) .ui-select-item-option-content"
      )
    ).find((node) => node.textContent === option)!;
    expect(match).toBeDefined();
    return match;
  });
  fireEvent.click(content);
  fireEvent.keyDown(input, { key: "Escape" });
}

describe("音色目录表格", () => {
  it("编辑期间固定分页结果，目录刷新仍更新单元格，结束编辑后恢复排序", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...sonia,
      alias: `voice-${index + 1}`,
      display_name: `Voice ${index + 1}`
    }));
    const table = (current: AdminSpeechVoice[], editing: boolean) => (
      <VoiceCatalogTable
        voices={current}
        metadata={new Map()}
        metadataEditing={editing}
        loading={false}
        settingsPending={false}
        canGenerate
        validText
        pendingVoice={null}
        onAudition={vi.fn()}
        onDetails={vi.fn()}
      />
    );
    const { container, rerender } = render(table(items, false));
    fireEvent.click(screen.getByTitle("2"));
    expect(names(container)).toEqual(["Voice 11", "Voice 12"]);
    rerender(table(items, true));
    const refreshed = [
      { ...sonia, alias: "new-voice", display_name: "Voice 0" },
      ...items.map((voice) =>
        voice.alias === "voice-12"
          ? { ...voice, display_name: "Aardvark" }
          : voice
      )
    ];
    rerender(table(refreshed, true));
    expect(names(container)).toEqual(["Voice 11", "Aardvark"]);
    expect(screen.getByRole("searchbox", { name: "搜索音色" })).toBeDisabled();
    expect(screen.getByText("共 12 个音色")).toBeVisible();
    rerender(table(refreshed, false));
    expect(names(container)).toEqual(["Voice 9", "Voice 10", "Voice 11"]);
    expect(screen.getByRole("searchbox", { name: "搜索音色" })).toBeEnabled();
    expect(screen.getByText("共 13 个音色")).toBeVisible();
  });

  it("一个搜索入口查找名称、官方特征、共享介绍和听感，清除后恢复", () => {
    const { container } = mount();
    const search = screen.getByRole("searchbox", { name: "搜索音色" });
    for (const value of ["sonia", "gentle", "慢读", "共享介绍"]) {
      fireEvent.change(search, { target: { value } });
      expect(names(container)).toContain("Sonia");
    }
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("未找到符合条件的数据")).toBeVisible();
    resetFilters();
    expect(names(container)).toHaveLength(4);
  });

  it("语言中英原文搜索和官方地区、人工口音相互独立", async () => {
    const { container } = mount([
      {
        ...sonia,
        alias: "luna",
        display_name: "Luna",
        locale: "en-SG",
        accent: "gb"
      },
      {
        ...sonia,
        alias: "wayne",
        display_name: "Wayne",
        locale: "en-SG",
        accent: "none"
      }
    ]);
    for (const text of ["英语", "English", "en-SG"]) {
      fireEvent.change(screen.getByRole("searchbox", { name: "搜索音色" }), {
        target: { value: text }
      });
      expect(names(container)).toHaveLength(2);
    }
    await select("官方地区", "新加坡");
    await select("口音归属", "英式");
    expect(names(container)).toEqual(["Luna"]);
  });

  it("表头模型筛选直接应用，清除时重置", async () => {
    const { container } = mount();
    expect(screen.getByRole("combobox", { name: "模型" })).toBeVisible();
    await select("模型", "Multilingual");
    expect(names(container)).toEqual(["Ava"]);
    resetFilters();
    expect(names(container)).toHaveLength(4);
  });

  it("场景多选取并集，与地区、模型及风格交叉筛选", async () => {
    const { container } = mount();
    await select("推荐场景", "新闻");
    await select("推荐场景", "有声书");
    expect(names(container)).toEqual(["Ava", "Sonia", "Ana"]);
    await select("官方地区", "美国");
    expect(names(container)).toEqual(["Ava", "Ana"]);
    await select("模型", "Multilingual");
    await select("可选风格", "愉快");
    expect(names(container)).toEqual(["Ava"]);
  });

  it("角色单选切换会替换旧条件，并区分无与未知", async () => {
    const { container } = mount();
    await select("可选角色", "无");
    expect(names(container)).toEqual(["Sonia", "Ana"]);
    await select("可选角色", "未提供");
    expect(names(container)).toEqual(["Unknown"]);
  });

  it("风格单选替换旧条件，与角色组合，分别清空恢复全部", async () => {
    const { container } = mount([
      sonia,
      { ...voices[1]!, capabilities: { ...sonia.capabilities, styles: [] } },
      {
        ...voices[2]!,
        capabilities: { ...sonia.capabilities, styles: ["sad"] }
      }
    ]);
    await select("可选风格", "愉快");
    expect(names(container)).toEqual(["Sonia"]);
    await select("可选风格", "悲伤");
    expect(names(container)).toEqual(["Ava"]);
    await select("可选角色", "无");
    expect(names(container)).toEqual([]);
    const clear = (label: string) => {
      const control = visibleControl(label).closest(".ui-select")!;
      fireEvent.click(control.querySelector(".ui-select-clear")!);
    };
    clear("可选风格");
    expect(names(container)).toEqual(["Sonia", "Ana"]);
    clear("可选角色");
    expect(names(container)).toEqual(["Ava", "Sonia", "Ana"]);
  });

  it("名称排序可切换方向，并与年龄筛选联动", async () => {
    const { container } = mount();
    fireEvent.click(visibleControl("音色筛选和排序"));
    await select("音色排序", "名称倒序");
    expect(names(container)).toEqual(["Unknown", "Sonia", "Ava", "Ana"]);
    await select("音色排序", "名称升序");
    expect(names(container)).toEqual(["Ana", "Ava", "Sonia", "Unknown"]);
    await select("年龄组", "儿童");
    expect(names(container)).toEqual(["Ana"]);
  });

  it("年龄排序可切换方向，未知项都在末尾", async () => {
    const { container } = mount();
    await select("音色排序", "年龄升序");
    expect(names(container)).toEqual(["Ana", "Ava", "Sonia", "Unknown"]);
    await select("音色排序", "年龄倒序");
    expect(names(container)).toEqual(["Sonia", "Ava", "Ana", "Unknown"]);
  });

  it("旧 API 缺资料时仍可试听，只展示真实模型选项，并区分官方原文和人工资料", async () => {
    const { container } = mount();
    const unknown = screen.getByLabelText("试听 Unknown").closest("tr")!;
    expect(within(unknown).getByText("年龄未提供")).toBeVisible();
    expect(screen.getByLabelText("试听 Unknown")).toBeEnabled();
    await select("模型", "Neural");
    expect(screen.queryByText("HD Omni")).toBeNull();
    expect(screen.queryByText("Neural HD")).toBeNull();
    expect(screen.queryByText("HD Flash · 普通高清")).toBeNull();
    expect(names(container)).toEqual(["Sonia", "Ana"]);
    expect(screen.getByText("共享介绍")).toBeVisible();
    expect(screen.getByText("我的听感：适合慢读")).toBeVisible();
  });
});

it("界面语言切换保留目录筛选、搜索与音色身份，不触发试听或编辑", async () => {
  const onAudition = vi.fn(),
    onDetails = vi.fn();
  const info = new Map([
    [
      "sonia",
      {
        voice_alias: "sonia",
        description_zh: "共享介绍",
        description_revision: 2,
        notes: "适合慢读",
        personal_revision: 3,
        parameters: null
      }
    ]
  ]);
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <VoiceCatalogTable
        voices={voices}
        metadata={info}
        loading={false}
        settingsPending={false}
        canGenerate
        validText
        pendingVoice={null}
        onAudition={onAudition}
        onDetails={onDetails}
      />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  await select("推荐场景", "新闻");
  const search = visibleControl("搜索音色");
  fireEvent.change(search, { target: { value: "溫柔" } });
  expect(names(view.container)).toEqual(["Ava", "Sonia"]);
  for (const locale of ["en-GB", "zh-Hant", "en-US", "zh-Hans"] as const) {
    view.rerender(content(locale));
    expect(search).toHaveValue("溫柔");
    expect(
      [...view.container.querySelectorAll("tbody tr[data-row-key]")].map(
        (row) => row.getAttribute("data-row-key")
      )
    ).toEqual(["ava", "sonia"]);
    expect(screen.getByText("共享介绍")).toBeVisible();
    expect(onAudition).not.toHaveBeenCalled();
    expect(onDetails).not.toHaveBeenCalled();
  }
});

it("下拉检索词在切换语言后仍能匹配默认风格，不改变选择或触发操作", async () => {
  const onAudition = vi.fn(),
    onDetails = vi.fn();
  const data = new Map();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <VoiceCatalogTable
        voices={voices}
        metadata={data}
        loading={false}
        settingsPending={false}
        canGenerate
        validText
        pendingVoice={null}
        onAudition={onAudition}
        onDetails={onDetails}
      />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  const input = visibleControl("可选风格");
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: "默认" } });
  await waitFor(() =>
    expect(
      document.querySelector('.ui-select-item-option[title="默认"]')
    ).not.toBeNull()
  );
  view.rerender(content("en-GB"));
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue("默认");
  await waitFor(() =>
    expect(
      document.querySelector('.ui-select-item-option[title="Default"]')
    ).not.toBeNull()
  );
  expect(onAudition).not.toHaveBeenCalled();
  expect(onDetails).not.toHaveBeenCalled();
});
