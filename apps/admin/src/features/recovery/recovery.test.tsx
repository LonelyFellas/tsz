import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDraftRecovery } from "./useDraftRecovery";
import {
  clearOtherSnapshots,
  snapshotKey,
  writeSnapshot
} from "@tsz/shared/recovery";
vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ profile: { id: "editor" } })
}));
beforeEach(() => sessionStorage.clear());
function Editor({ revision = 1 }: { revision?: number }) {
  const [text, setText] = useState("");
  const recovery = useDraftRecovery({
    entity: "word:1",
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
