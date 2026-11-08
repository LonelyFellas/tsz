import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDraftRecovery } from "./useDraftRecovery";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import {
  clearOtherSnapshots,
  snapshotKey,
  writeSnapshot
} from "@tsz/shared/recovery";
const auth = vi.hoisted(() => ({ id: "editor" }));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      profile: {
        id: auth.id,
        role: "admin",
        permissions: ["words.access", "words.edit", "words.edit_others"]
      }
    })
}));
beforeEach(() => {
  auth.id = "editor";
  sessionStorage.clear();
});
function Editor({
  revision = 1,
  savedRevision,
  entity = "word:1"
}: {
  revision?: number;
  savedRevision?: number;
  entity?: string;
}) {
  const [text, setText] = useState("");
  const recovery = useDraftRecovery({
    entity,
    revision,
    savedRevision,
    value: text,
    dirty: !!text,
    busy: false,
    restore: setText
  });
  return (
    <>
      {recovery.notice}
      <input
        aria-label="内容"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </>
  );
}
it("切换语言不改写既有备份，也不自动恢复或丢弃输入", () => {
  const key = snapshotKey("editor", "word:1");
  writeSnapshot(key, 1, "保留中文与 centre 原文", sessionStorage);
  const original = sessionStorage.getItem(key);
  const content = (locale: "zh-Hans" | "en-US" | "zh-Hant") => (
    <InterfaceI18nProvider locale={locale}>
      <Editor />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  view.rerender(content("en-US"));
  expect(screen.getByText("An unsaved editing backup was found")).toBeVisible();
  expect(screen.getByLabelText("内容")).toHaveValue("");
  expect(sessionStorage.getItem(key)).toBe(original);
  view.rerender(content("zh-Hant"));
  expect(sessionStorage.getItem(key)).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "恢復編輯" }));
  expect(screen.getByLabelText("内容")).toHaveValue("保留中文与 centre 原文");
  expect(JSON.parse(sessionStorage.getItem(key)!).value).toBe(
    "保留中文与 centre 原文"
  );
});
it("recovers unsaved input after unmount without automatically saving it", () => {
  const first = render(<Editor />);
  fireEvent.change(screen.getByLabelText("内容"), {
    target: { value: "尚未保存" }
  });
  first.unmount();
  render(<Editor />);
  expect(screen.getByLabelText("内容")).toHaveValue("");
  fireEvent.click(screen.getByText("恢复编辑"));
  expect(screen.getByLabelText("内容")).toHaveValue("尚未保存");
});
it("does not restore a stale revision over server changes", () => {
  writeSnapshot(snapshotKey("editor", "word:1"), 1, "旧输入", sessionStorage);
  render(<Editor revision={2} />);
  expect(screen.getByText("发现编辑备份，但服务器内容已更新")).toBeVisible();
  expect(screen.queryByText("恢复编辑")).toBeNull();
  expect(screen.getByLabelText("内容")).toHaveValue("");
});
it.each([true, false])(
  "部分保存只为本编辑器已确认的版本更新备份基线：%s",
  (ownSave) => {
    const view = render(<Editor />);
    fireEvent.change(screen.getByLabelText("内容"), {
      target: { value: "仍未保存的词形" }
    });
    view.rerender(
      <Editor revision={2} savedRevision={ownSave ? 2 : undefined} />
    );
    view.unmount();
    render(<Editor revision={2} />);
    if (ownSave) {
      fireEvent.click(screen.getByText("恢复编辑"));
      expect(screen.getByLabelText("内容")).toHaveValue("仍未保存的词形");
    } else {
      expect(screen.queryByText("恢复编辑")).toBeNull();
      expect(
        screen.getByText("发现编辑备份，但服务器内容已更新")
      ).toBeVisible();
    }
  }
);
it("同词条换账号不读另一人的未保存备份，也不读取或迁移未标身份的旧备份", () => {
  const entity = "word-v3:shared-entry";
  const legacy = "word-v3:shared-entry";
  writeSnapshot(legacy, 1, "旧未标身份备份", sessionStorage);
  localStorage.setItem(legacy, "旧localStorage备份");
  auth.id = "admin-a";
  const a = render(<Editor entity={entity} />);
  expect(screen.queryByText("恢复编辑")).toBeNull();
  fireEvent.change(screen.getByLabelText("内容"), {
    target: { value: "甲的未保存内容" }
  });
  a.unmount();
  auth.id = "admin-b";
  const b = render(<Editor entity={entity} />);
  expect(screen.queryByText("恢复编辑")).toBeNull();
  expect(screen.getByLabelText("内容")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("内容"), {
    target: { value: "乙的未保存内容" }
  });
  b.unmount();
  auth.id = "admin-a";
  render(<Editor entity={entity} />);
  fireEvent.click(screen.getByText("恢复编辑"));
  expect(screen.getByLabelText("内容")).toHaveValue("甲的未保存内容");
  expect(sessionStorage.getItem(snapshotKey("admin-b", entity))).toContain(
    "乙的未保存内容"
  );
  expect(sessionStorage.getItem(legacy)).toContain("旧未标身份备份");
  expect(localStorage.getItem(legacy)).toBe("旧localStorage备份");
  localStorage.removeItem(legacy);
});

it("clears other accounts' backups and never serializes temporary media as saved", () => {
  writeSnapshot(snapshotKey("other", "word:1"), 1, "private", sessionStorage);
  writeSnapshot(snapshotKey("editor", "word:1"), 1, "mine", sessionStorage);
  clearOtherSnapshots("editor", sessionStorage);
  expect(sessionStorage.getItem(snapshotKey("other", "word:1"))).toBeNull();
  expect(() =>
    writeSnapshot("media", 1, { file: new Blob(["audio"]) }, sessionStorage)
  ).toThrow();
  act(() => clearOtherSnapshots(null, sessionStorage));
  expect(sessionStorage.length).toBe(0);
});
