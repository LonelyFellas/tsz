import { CrownOutlined, UserOutlined } from "@ant-design/icons";
import { describe, expect, it } from "vitest";
import { adminAvatarStyle } from "./adminAvatar";

describe("adminAvatarStyle", () => {
  it("super_admin → 金色皇冠", () => {
    const s = adminAvatarStyle("super_admin");
    expect(s.background).toBe("#faad14");
    // 图标为 CrownOutlined 元素。
    expect((s.icon as { type: unknown }).type).toBe(CrownOutlined);
  });

  it("admin → 品牌蓝用户图标", () => {
    const s = adminAvatarStyle("admin");
    expect(s.background).toBe("#0071e3");
    expect((s.icon as { type: unknown }).type).toBe(UserOutlined);
  });

  it("缺省 level 回退普通管理员样式", () => {
    expect(adminAvatarStyle(undefined)).toEqual(adminAvatarStyle("admin"));
  });
});
