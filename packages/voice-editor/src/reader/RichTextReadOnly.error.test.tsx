import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextReadOnly } from "./RichTextReadOnly";

vi.mock("./segments", () => ({
  segmentRichText: () => {
    throw new Error("unexpected renderer failure");
  }
}));

describe("RichTextReadOnly unexpected failures", () => {
  it("does not hide non-validation programming errors", () => {
    expect(() =>
      render(
        <RichTextReadOnly
          value={{ version: 2, text: "text", annotations: [] }}
        />
      )
    ).toThrow("unexpected renderer failure");
  });
});
