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
      creationSourceFromState({ creationSource: "dictionary-empty" })
    ).toBe("dictionary-empty");
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
    rerender(<CreationSourceNotice source={"dictionary-empty" as never} />);
    expect(screen.getByText("词性建议尚未写入，请手动补充")).toBeVisible();
    expect(
      screen.getByText(
        "当前草稿没有词性或词形，请从右上角添加词性；系统未复制重复词条的既有内容。"
      )
    ).toBeVisible();
    expect(screen.queryByText(/matched|not_found|V3/)).toBeNull();
  });
});
