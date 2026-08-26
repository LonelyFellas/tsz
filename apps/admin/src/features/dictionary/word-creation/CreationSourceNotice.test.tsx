import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CreationSourceNotice,
  creationSourceFromState
} from "./CreationSourceNotice";

describe("CreationSourceNotice", () => {
  it("只接受正式来源状态", () => {
    expect(creationSourceFromState({ creationSource: "dictionary" })).toBe(
      "dictionary"
    );
    expect(creationSourceFromState({ creationSource: "blank" })).toBe("blank");
    expect(
      creationSourceFromState({ creationSource: "matched" })
    ).toBeUndefined();
    expect(creationSourceFromState(null)).toBeUndefined();
  });

  it("用产品语言区分建议预填与空白草稿", () => {
    const { rerender } = render(<CreationSourceNotice source="dictionary" />);
    expect(screen.getByText("已根据内置词典预填，请核对")).toBeVisible();
    rerender(<CreationSourceNotice source="blank" />);
    expect(
      screen.getByText("未找到内置词典建议，已创建空白草稿")
    ).toBeVisible();
    expect(screen.queryByText(/matched|not_found|V3/)).toBeNull();
  });
});
