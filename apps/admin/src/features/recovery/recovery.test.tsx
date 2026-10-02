import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDraftRecovery } from "./useDraftRecovery";
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
  entity = "word:1"
}: {
  revision?: number;
  entity?: string;
}) {
  const [text, setText] = useState("");
  const recovery = useDraftRecovery({
    entity,
    revision,
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
