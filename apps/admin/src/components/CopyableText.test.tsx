import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopyableText } from "./CopyableText";

describe("CopyableText", () => {
  it("有值：展示文本并挂上复制按钮", () => {
    render(<CopyableText value="13800138000" />);
    expect(screen.getByText("13800138000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("受限剪贴板下如实反馈失败，重试时复制完整值", async () => {
    const value = "12345678-1234-1234-1234-123456789abc";
    const copy = vi.fn(() => false);
    const original = Object.getOwnPropertyDescriptor(document, "execCommand");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: copy
    });
    try {
      render(<CopyableText value={value} ellipsis={96} />);
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      const retry = await screen.findByRole("button", { name: /复制失败/ });
      copy.mockImplementation(() => {
        const field = document.querySelector("textarea");
        return (
          field?.value.slice(field.selectionStart, field.selectionEnd) === value
        );
      });
      fireEvent.click(retry);
      expect(
        await screen.findByRole("button", { name: "已复制" })
      ).toBeVisible();
    } finally {
      if (original) Object.defineProperty(document, "execCommand", original);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("空值：渲染占位「-」、不出现复制按钮", () => {
    render(<CopyableText value={undefined} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });

  it("空字符串走占位分支（视作无值）", () => {
    render(<CopyableText value="" />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("自定义占位", () => {
    render(<CopyableText value={null} placeholder="—无—" />);
    expect(screen.getByText("—无—")).toBeInTheDocument();
  });

  it("ellipsis 传 number：限制最大宽度并开启截断", () => {
    const { container } = render(
      <CopyableText value="a-very-long-uuid-value" ellipsis={96} />
    );
    // Typography.Text 以 style.max-width 承载限宽。
    const node = container.querySelector<HTMLElement>(".ui-typography");
    expect(node?.style.maxWidth).toBe("96px");
  });

  it("ellipsis 传 true：开启截断但不限宽", () => {
    const { container } = render(
      <CopyableText value="another-long-value" ellipsis />
    );
    const node = container.querySelector<HTMLElement>(".ui-typography");
    expect(node?.style.maxWidth).toBe("");
  });
});

it("复制包装沿用共享语言标签，完整业务原值不变", async () => {
  const raw = "用户原始 ID centre 12345678";
  const original = Object.getOwnPropertyDescriptor(document, "execCommand");
  let copied = "";
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => {
      copied = document.querySelector("textarea")?.value ?? "";
      return true;
    }
  });
  try {
    const content = (locale: "zh-Hans" | "en-US") => (
      <InterfaceI18nProvider locale={locale}>
        <CopyableText value={raw} ellipsis={96} />
      </InterfaceI18nProvider>
    );
    const view = render(content("zh-Hans"));
    view.rerender(content("en-US"));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    expect(copied).toBe(raw);
    view.rerender(content("zh-Hans"));
    expect(screen.getByRole("button", { name: "已复制" })).toBeVisible();
    expect(screen.getByText(raw)).toBeVisible();
  } finally {
    if (original) Object.defineProperty(document, "execCommand", original);
    else Reflect.deleteProperty(document, "execCommand");
  }
});
