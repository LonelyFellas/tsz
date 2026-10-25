import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { ConfigProvider } from "antd";
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
    <ConfigProvider theme={{ token: { motion: false } }}>
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
        onSettings={vi.fn()}
      />
    </ConfigProvider>
  );
}
function names(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("tbody button[aria-label^='试听 ']")
  ).map((node) => node.getAttribute("aria-label")!.slice(3));
}
async function select(label: string, option: string) {
  const input = screen.getByLabelText(label);
  fireEvent.mouseDown(input);
  const content = await waitFor(() => {
    const match = Array.from(
      document.querySelectorAll(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
      )
    ).find((node) => node.textContent === option)!;
    expect(match).toBeDefined();
    return match;
  });
  fireEvent.click(content);
  fireEvent.keyDown(input, { key: "Escape" });
}

describe("音色目录表头", () => {
  it("表头只有一份交互控件，搜索名称和官方特征／共享介绍／听感，清除后恢复", () => {
    const { container } = mount();
    const search = screen.getByLabelText("搜索音色");
    expect(search.closest("thead")).not.toBeNull();
    fireEvent.change(search, { target: { value: "sonia" } });
    fireEvent.change(screen.getByLabelText("搜索介绍与听感"), {
      target: { value: "gentle" }
    });
    expect(names(container)).toEqual(["Sonia"]);
    fireEvent.change(screen.getByLabelText("搜索介绍与听感"), {
      target: { value: "慢读" }
    });
    expect(names(container)).toEqual(["Sonia"]);
    fireEvent.change(screen.getByLabelText("搜索介绍与听感"), {
      target: { value: "共享介绍" }
    });
    expect(names(container)).toEqual(["Sonia"]);
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("未找到符合条件的数据")).toBeVisible();
    fireEvent.click(screen.getByText("清除筛选"));
    expect(names(container)).toHaveLength(4);
  });

  it("场景多选取并集，与地区、模型及风格交叉筛选；角色无与未知分别筛选", async () => {
    const { container } = mount();
    await select("推荐场景", "新闻");
    await select("推荐场景", "有声书");
    expect(names(container)).toEqual(["Ava", "Sonia", "Ana"]);
    await select("口音／地区", "美国");
    expect(names(container)).toEqual(["Ava", "Ana"]);
    await select("模型", "Multilingual");
    await select("可选风格", "愉快");
    expect(names(container)).toEqual(["Ava"]);
    fireEvent.click(screen.getByText("清除筛选"));
    await select("可选角色", "无");
    expect(names(container)).toEqual(["Sonia", "Ana"]);
    fireEvent.click(screen.getByText("清除筛选"));
    await select("可选角色", "未提供");
    expect(names(container)).toEqual(["Unknown"]);
  });

  it("名称和年龄排序互斥，两个年龄方向的未知项都在末尾", async () => {
    const { container } = mount();
    await select("名称排序", "名称倒序");
    expect(names(container)).toEqual(["Unknown", "Sonia", "Ava", "Ana"]);
    await select("年龄排序", "年龄升序");
    expect(names(container)).toEqual(["Ana", "Ava", "Sonia", "Unknown"]);
    await select("年龄排序", "年龄倒序");
    expect(names(container)).toEqual(["Sonia", "Ava", "Ana", "Unknown"]);
    await select("名称排序", "名称升序");
    expect(names(container)).toEqual(["Ana", "Ava", "Sonia", "Unknown"]);
    await select("年龄组", "儿童");
    expect(names(container)).toEqual(["Ana"]);
  });

  it("旧 API 缺资料时仍可试听，只展示真实模型选项，并区分官方原文和人工资料", async () => {
    const { container } = mount();
    const unknown = screen.getByLabelText("试听 Unknown").closest("tr")!;
    expect(within(unknown).getAllByText("未提供").length).toBeGreaterThan(1);
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
