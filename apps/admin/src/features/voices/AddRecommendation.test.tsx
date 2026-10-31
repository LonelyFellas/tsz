import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import type {
  AdminDubbingGroupsV3Response,
  AdminSpeechVoice
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { AddRecommendation } from "./AddRecommendation";
import { DubbingDrafts, useDubbingDrafts } from "./DubbingDrafts";

const voice: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  accent: "gb",
  gender: "female",
  is_common: true,
  capabilities: {
    styles: [],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  }
};
const otherVoice: AdminSpeechVoice = {
  ...voice,
  alias: "guy",
  display_name: "Guy",
  gender: "male",
  locale: "en-US",
  accent: "us"
};
const parameters = {
  rate_percent: -27,
  pitch_semitones: 2,
  volume_percent: 65,
  style: null
};
const initial: AdminDubbingGroupsV3Response = {
  revision: 1,
  order_revision: 2,
  groups: [
    {
      id: "a",
      name: "A",
      areas: ["word"],
      revision: 3,
      is_global: false,
      recommendations: { format: "paired", pairs: [] }
    },
    {
      id: "b",
      name: "B",
      areas: ["example"],
      revision: 2,
      is_global: false,
      recommendations: { format: "paired", pairs: [] }
    }
  ]
};
const clients: QueryClient[] = [];
function Harness() {
  const [drafts, setDrafts] = useDubbingDrafts();
  return (
    <>
      <AddRecommendation
        voice={voice}
        voices={[voice, otherVoice]}
        readParameters={async () => parameters}
        onBusyChange={vi.fn()}
        onClose={vi.fn()}
      />
      <output data-testid="drafts">{JSON.stringify(drafts)}</output>
      <button
        onClick={() =>
          setDrafts((value) => ({
            ...value,
            b: { ...initial.groups[1]!, name: "B draft" }
          }))
        }
      >
        编辑B
      </button>
    </>
  );
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  clients.push(client);
  client.setQueryData(
    ["admin-dubbing-groups-v3", "groups-admin"],
    structuredClone(initial)
  );
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <DubbingDrafts>
            <Harness />
          </DubbingDrafts>
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return client;
}
beforeEach(() => {
  useAuthStore.getState().setProfile({
    id: "groups-admin",
    phone: "13800138446",
    display_name: "分组管理员",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions: ["words.access", "speech.global_dubbing"]
  });
  vi.spyOn(api.speech, "groupsV3").mockResolvedValue(initial);
  vi.spyOn(api.speech, "saveGroups");
  vi.spyOn(api.speech, "saveGroup");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});
describe("完整推荐只应用到分组草稿", () => {
  async function chooseGroup() {
    fireEvent.mouseDown(screen.getByLabelText("推荐分组"));
    fireEvent.click(
      await screen.findByText("A", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "创建整套推荐" }));
  }
  it("预填当前侧完整参数，要求人工另一侧，服务器缓存和 B 草稿不变", async () => {
    const client = mount();
    fireEvent.click(screen.getByText("编辑B"));
    await chooseGroup();
    expect(
      await screen.findByRole("radio", { name: "Sonia 女声" })
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    await screen.findByText("请明确选择美式音色，每套必须包含英美各一项。");
    expect(screen.getByTestId("drafts")).not.toHaveTextContent('"a":');
    fireEvent.click(screen.getByRole("radio", { name: "Guy 男声" }));
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    await screen.findByText("已应用到分组草稿，请回到该组点击“完成”后保存。");
    const drafts = JSON.parse(screen.getByTestId("drafts").textContent!);
    expect(drafts.a.recommendations.pairs[0]).toMatchObject({
      selected: true,
      uk: { voice_alias: "sonia", parameters },
      us: { voice_alias: "guy" }
    });
    expect(drafts.b.name).toBe("B draft");
    expect(
      client.getQueryData(["admin-dubbing-groups-v3", "groups-admin"])
    ).toEqual(initial);
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
  });
  it("已有20套时保留分组选择并拒绝追加", async () => {
    const full = structuredClone(initial);
    full.groups[0]!.recommendations = {
      format: "paired",
      pairs: Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        name: String(i),
        selected: true,
        uk: { id: `uk-${i}`, voice_alias: "sonia", parameters },
        us: { id: `us-${i}`, voice_alias: "guy", parameters }
      }))
    };
    const client = mount();
    await act(async () =>
      client.setQueryData(["admin-dubbing-groups-v3", "groups-admin"], full)
    );
    await chooseGroup();
    await screen.findByText("该组已有 20 个推荐，请先在分组配音中整理。");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("drafts")).toHaveTextContent("{}");
  });
});
