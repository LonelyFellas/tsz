import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AdminLexiconLanguages,
  AdminProfile,
  UpdateAdminPreferencesResponse
} from "@tsz/types";
import { api, tokens, useAuthStore } from "@/lib/auth";
import { accountLanguagePreferences as preferences } from "./accountLanguagePreferences";

const choice = (
  target_locale: string,
  medium_locale: string
): AdminLexiconLanguages => ({
  target_language: "en",
  target_locale,
  medium_locale
});
let generation = 0;
let server: AdminLexiconLanguages | null;
const current = () => useAuthStore.getState().profile!;
beforeEach(async () => {
  ++generation;
  server = choice("en-GB", "zh-Hans");
  useAuthStore.setState({
    profile: {
      id: "account-a",
      phone: "fixture",
      display_name: "fixture",
      role: "admin",
      permission_version: 1,
      catalog_version: "v1",
      permissions: ["words.access"],
      preferences: {
        dialect: "uk",
        interface_locale: "zh-Hans",
        lexicon_languages: server
      }
    }
  });
  vi.spyOn(tokens, "getSessionGeneration").mockImplementation(() => generation);
  vi.spyOn(api, "profile").mockImplementation(async () => ({
    ...structuredClone(current()),
    preferences: { ...current().preferences, lexicon_languages: server }
  }));
  vi.spyOn(api, "updateProfilePreferences").mockImplementation(
    async (input) => {
      if (
        input.lexicon_languages &&
        (!input.lexicon_languages_if_unset || !server)
      )
        server = input.lexicon_languages;
      return {
        preferences: { ...current().preferences, lexicon_languages: server }
      };
    }
  );
  await preferences.refresh();
});
afterEach(() => vi.restoreAllMocks());

it("连续选择串行写入，最终保存最新组合且不回填其他陈旧字段", async () => {
  let finish!: (value: UpdateAdminPreferencesResponse) => void;
  vi.mocked(api.updateProfilePreferences).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  preferences.save(choice("en-US", "zh-Hans"));
  preferences.save(choice("en-US", "zh-Hant"));
  await waitFor(() =>
    expect(api.updateProfilePreferences).toHaveBeenCalledTimes(1)
  );
  useAuthStore.getState().setProfile({
    ...current(),
    permissions: [],
    permission_version: 2,
    preferences: { ...current().preferences, interface_locale: "zh-Hant" }
  });
  finish({
    preferences: {
      dialect: "us",
      interface_locale: null,
      lexicon_languages: choice("en-US", "zh-Hans")
    }
  });
  await waitFor(() => expect(preferences.getSnapshot().saving).toBe(false));
  expect(api.updateProfilePreferences).toHaveBeenCalledTimes(2);
  expect(server).toEqual(choice("en-US", "zh-Hant"));
  expect(current().preferences).toEqual({
    dialect: "uk",
    interface_locale: "zh-Hant",
    lexicon_languages: server
  });
  expect(current().permissions).toEqual([]);
});

it("保存失败保留最新意图，重新进入不清除错误；重试后账号得到新值", async () => {
  vi.mocked(api.updateProfilePreferences).mockRejectedValueOnce(
    new Error("offline")
  );
  const desired = choice("en-US", "zh-Hant");
  preferences.save(desired);
  await waitFor(() => expect(preferences.getSnapshot().error).toBe("offline"));
  await preferences.refresh();
  expect(preferences.getSnapshot().desired).toEqual(desired);
  expect(preferences.getSnapshot().error).toBe("offline");
  preferences.retry();
  await waitFor(() => expect(preferences.getSnapshot().error).toBeNull());
  expect(server).toEqual(desired);
  expect(preferences.getSnapshot().preference).toEqual(desired);
  expect(preferences.getSnapshot().desired).toBeNull();
});

it("账号切换后旧响应不回填，旧排队写入不会使用新账号的会话", async () => {
  let finish!: (value: UpdateAdminPreferencesResponse) => void;
  vi.mocked(api.updateProfilePreferences).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  preferences.save(choice("en-US", "zh-Hant"));
  preferences.save(choice("en-GB", "zh-Hant"));
  await waitFor(() =>
    expect(api.updateProfilePreferences).toHaveBeenCalledTimes(1)
  );
  ++generation;
  useAuthStore.setState({
    profile: {
      ...current(),
      id: "account-b",
      preferences: {
        ...current().preferences,
        lexicon_languages: choice("en-GB", "zh-Hans")
      }
    }
  });
  const read = preferences.refresh();
  finish({
    preferences: {
      dialect: "uk",
      lexicon_languages: choice("en-US", "zh-Hant")
    }
  });
  await read;
  expect(api.updateProfilePreferences).toHaveBeenCalledTimes(1);
  expect(current().id).toBe("account-b");
  expect(current().preferences.lexicon_languages).toEqual(
    choice("en-GB", "zh-Hans")
  );
  preferences.save(choice("en-GB", "zh-Hant"));
  await waitFor(() =>
    expect(api.updateProfilePreferences).toHaveBeenCalledTimes(2)
  );
  await waitFor(() => expect(preferences.getSnapshot().saving).toBe(false));
  expect(current().preferences.lexicon_languages).toEqual(
    choice("en-GB", "zh-Hant")
  );
});

it("晚到的读取结果不覆盖读取期间主动保存的新选择", async () => {
  let finish!: (value: AdminProfile) => void;
  vi.mocked(api.profile).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const read = preferences.refresh();
  await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(2));
  const old = structuredClone(current());
  preferences.save(choice("en-US", "zh-Hant"));
  await waitFor(() => expect(preferences.getSnapshot().saving).toBe(false));
  finish(old);
  await read;
  expect(current().preferences.lexicon_languages).toEqual(
    choice("en-US", "zh-Hant")
  );
  expect(preferences.getSnapshot().preference).toEqual(
    choice("en-US", "zh-Hant")
  );
});

it("旧缓存导入接受服务端已有账号值，不覆盖另一个设备的选择", async () => {
  server = choice("en-US", "zh-Hant");
  vi.mocked(api.profile).mockResolvedValueOnce({
    ...current(),
    preferences: { ...current().preferences, lexicon_languages: null }
  });
  await preferences.refresh(choice("en-GB", "zh-Hans"));
  expect(api.updateProfilePreferences).toHaveBeenCalledWith({
    lexicon_languages: choice("en-GB", "zh-Hans"),
    lexicon_languages_if_unset: true
  });
  expect(preferences.getSnapshot().preference).toEqual(server);
  expect(current().preferences.lexicon_languages).toEqual(server);
});
