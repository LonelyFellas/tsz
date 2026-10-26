import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { AdminDubbingGroupsResponse, AdminSpeechVoice } from "@tsz/types";
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
const parameters = {
  rate_percent: -27,
  pitch_semitones: 2,
  volume_percent: 65,
  style: null
};
const initial: AdminDubbingGroupsResponse = {
  revision: 1,
  groups: [
    { id: "a", name: "A", areas: ["word"], revision: 3, uk: [], us: [] },
    { id: "b", name: "B", areas: ["example"], revision: 2, uk: [], us: [] }
  ]
};
const clients: QueryClient[] = [];
function Harness() {
  const [drafts, setDrafts] = useDubbingDrafts();
  return (
    <>
      <AddRecommendation
        voice={voice}
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
    ["admin-dubbing-groups", "groups-admin"],
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
  vi.spyOn(api.speech, "groups").mockResolvedValue(initial);
  vi.spyOn(api.speech, "saveGroups");
  vi.spyOn(api.speech, "saveGroup");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});
describe("推荐只应用到分组草稿", () => {
  it("复制完整参数仅写目标草稿，服务器缓存和B草稿不变", async () => {
    const client = mount();
    fireEvent.click(screen.getByText("编辑B"));
    fireEvent.mouseDown(screen.getByLabelText("推荐分组"));
    fireEvent.click(
      await screen.findByText("A", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认加入推荐" }));
    await screen.findByText("已应用到分组草稿，请回到该组点击“完成”后保存。");
    const drafts = JSON.parse(screen.getByTestId("drafts").textContent!);
    expect(drafts.a.uk[0]).toMatchObject({
      selected: true,
      voice_alias: "sonia",
      parameters
    });
    expect(drafts.b.name).toBe("B draft");
    expect(
      client.getQueryData(["admin-dubbing-groups", "groups-admin"])
    ).toEqual(initial);
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
  });
  it("选中分组已有20项时保留输入并拒绝新增", async () => {
    const full = structuredClone(initial);
    full.groups[0]!.uk = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      name: String(index),
      voice_alias: "sonia",
      parameters
    }));
    const client = mount();
    await act(async () => {
      client.setQueryData(["admin-dubbing-groups", "groups-admin"], full);
    });
    fireEvent.mouseDown(screen.getByLabelText("推荐分组"));
    fireEvent.click(
      await screen.findByText("A", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认加入推荐" }));
    await waitFor(() =>
      expect(
        screen.getByText("该口音已有 20 个推荐，请先在分组配音中整理。")
      ).toBeVisible()
    );
    expect(screen.getByLabelText("推荐版本名称")).toHaveValue("Sonia");
    expect(screen.getByTestId("drafts")).toHaveTextContent("{}");
  });
});
