import WorkspacePremium from "@mui/icons-material/WorkspacePremium";
import Person from "@mui/icons-material/Person";
import type { AdminLevel } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { adminAvatarStyle } from "./adminAvatar";

describe("adminAvatarStyle", () => {
  it("super_admin → 金色皇冠", () => {
    const s = adminAvatarStyle("super_admin");
    expect(s.background).toBe("#faad14");
    // 图标为 WorkspacePremium 元素。
    expect((s.icon as { type: unknown }).type).toBe(WorkspacePremium);
  });

  it("admin → 品牌蓝用户图标", () => {
    const s = adminAvatarStyle("admin");
    expect(s.background).toBe("#2053FF");
    expect((s.icon as { type: unknown }).type).toBe(Person);
  });

  it("缺省 level 回退普通管理员样式", () => {
    expect(adminAvatarStyle(undefined)).toEqual(adminAvatarStyle("admin"));
  });

  it("未映射的 level（后端将来新增等级）回退普通管理员，不返回 undefined", () => {
    const s = adminAvatarStyle("moderator" as AdminLevel);
    expect(s).toEqual(adminAvatarStyle("admin"));
  });
});
