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
import { App } from "@tsz/ui/admin/overlays";
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
      uk: [],
      us: []
    },
    {
      id: "b",
      name: "B",
      areas: ["example"],
      revision: 2,
      is_global: false,
      uk: [],
      us: []
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
      <App>
        <DubbingDrafts>
          <Harness />
        </DubbingDrafts>
      </App>
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
describe("当前口音推荐只应用到分组草稿", () => {
  async function chooseGroup() {
    fireEvent.mouseDown(screen.getByLabelText("推荐分组"));
    fireEvent.click(
      await screen.findByText("A", {
        selector: ".ui-select-item-option-content"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "新增推荐" }));
  }
  it("预填当前侧参数，不要求另一侧，服务器缓存与B草稿不变", async () => {
    const client = mount();
    fireEvent.click(screen.getByText("编辑B"));
    await chooseGroup();
    expect(screen.queryByRole("radio", { name: "Guy 男声" })).toBeNull();
    expect(await screen.findByLabelText("合成语速")).toHaveValue("0.73");
    expect(screen.getByLabelText("合成音量")).toHaveValue("65");
    fireEvent.click(screen.getByRole("button", { name: "保存到本组" }));
    await screen.findByText(/已应用到分组草稿/);
    const drafts = JSON.parse(screen.getByTestId("drafts").textContent!);
    expect(drafts.a.uk).toEqual([
      expect.objectContaining({
        selected: true,
        voice_alias: "sonia",
        parameters
      })
    ]);
    expect(drafts.a.us).toEqual([]);
    expect(drafts.b.name).toBe("B draft");
    expect(
      client.getQueryData(["admin-dubbing-groups-v3", "groups-admin"])
    ).toEqual(initial);
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
  });
  it("另一侧满20项不限制当前侧，取消编辑不制造草稿", async () => {
    const full = structuredClone(initial);
    full.groups[0]!.us = Array.from({ length: 20 }, (_, index) => ({
      id: `us-${index}`,
      name: String(index),
      selected: true,
      voice_alias: "guy",
      parameters
    }));
    const client = mount();
    await act(async () =>
      client.setQueryData(["admin-dubbing-groups-v3", "groups-admin"], full)
    );
    await chooseGroup();
    await screen.findByLabelText("合成语速");
    fireEvent.click(screen.getByRole("button", { name: /^取消$/ }));
    expect(screen.getByTestId("drafts")).toHaveTextContent("{}");
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
  });
  it("当前侧已有20项时保留分组选择并拒绝追加", async () => {
    const full = structuredClone(initial);
    full.groups[0]!.uk = Array.from({ length: 20 }, (_, i) => ({
      id: `uk-${i}`,
      name: String(i),
      selected: true,
      voice_alias: "sonia",
      parameters
    }));
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
