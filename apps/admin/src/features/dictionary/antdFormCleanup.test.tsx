import { cleanup, render } from "@testing-library/react";
import { ConfigProvider, Form } from "antd";
import { expect, it, vi } from "vitest";

it("卸载表单错误提示时取消延迟回调", () => {
  vi.useFakeTimers();
  try {
    const view = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <Form.ErrorList errors={["请填写标注"]} />
      </ConfigProvider>
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
