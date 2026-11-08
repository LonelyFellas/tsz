import { expect, it } from "vitest";
import { createAdminI18n } from "./index";
import { adminShellResources } from "./resources";

it("后台资源不缺键、空译文或插值，英美变体均可回退到英文", () => {
  const source = adminShellResources["zh-Hans"].adminShell;
  const placeholders = (text: string) =>
    [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
  for (const { adminShell: messages } of Object.values(adminShellResources)) {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(source).sort());
    for (const key of Object.keys(source) as (keyof typeof source)[]) {
      expect(messages[key].trim(), key).not.toBe("");
      expect(placeholders(messages[key]), key).toEqual(
        placeholders(source[key])
      );
    }
  }
  for (const locale of ["en-GB", "en-US"] as const) {
    const instance = createAdminI18n(locale);
    expect(instance.getFixedT(locale, "adminShell")("account_sign_out")).toBe(
      "Sign out"
    );
  }
});
