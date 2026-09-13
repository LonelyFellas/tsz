import { screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * 新建时不再从正式中文、正式英文带出简洁显示与英文全称。表单的 useWatch 通知是异步的，
 * 改完立刻断言空值抓不到联动，所以给它一段时间：期间两个字段一旦被填上就算失败。
 */
export async function expectDisplayNamesNotDerived() {
  await expect(
    waitFor(
      () => {
        const derived = ["简洁显示", "英文全称"]
          .map(
            (label) => (screen.getByLabelText(label) as HTMLInputElement).value
          )
          .join("");
        if (!derived) throw new Error("简洁显示与英文全称仍为空");
      },
      { timeout: 300 }
    )
  ).rejects.toThrow("简洁显示与英文全称仍为空");
}
