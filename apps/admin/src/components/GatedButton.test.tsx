import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GatedButton } from "./GatedButton";

describe("GatedButton", () => {
  it("enabled：可点击、触发 onClick", () => {
    const onClick = vi.fn();
    render(
      <GatedButton reason="不可操作" onClick={onClick}>
        编辑
      </GatedButton>
    );
    const btn = screen.getByRole("button", { name: /编\s?辑/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled：按钮置灰、点击不触发 onClick", () => {
    const onClick = vi.fn();
    render(
      <GatedButton disabled reason="不可操作" onClick={onClick}>
        编辑
      </GatedButton>
    );
    expect(screen.getByRole("button", { name: /编\s?辑/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /编\s?辑/ }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("透传 loading 等 Button 属性", () => {
    const { container } = render(
      <GatedButton loading type="primary">
        保存
      </GatedButton>
    );
    expect(container.querySelector("button.ant-btn-loading")).not.toBeNull();
    expect(container.querySelector("button.ant-btn-primary")).not.toBeNull();
  });

  it("reason 缺省时不报错（disabled 无提示文案）", () => {
    render(<GatedButton disabled>删除</GatedButton>);
    expect(screen.getByRole("button", { name: /删\s?除/ })).toBeDisabled();
  });
});
