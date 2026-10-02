import { describe, expect, it } from "vitest";
import {
  canAdminResourceAction,
  hasAdminPermission,
  hasAnyAdminPermission
} from "./adminPermissions";

const actor = { id: "a", role: "admin", permissions: [] as string[] };
describe("统一授权事实", () => {
  it("未知 key 和通配符对普通管理员/超管都失败关闭", () => {
    for (const role of ["admin", "super_admin"]) {
      expect(
        hasAdminPermission(
          { ...actor, role, permissions: ["future.access", "*"] },
          "future.access"
        )
      ).toBe(false);
      expect(
        hasAdminPermission({ ...actor, role, permissions: ["*"] }, "words.edit")
      ).toBe(role === "super_admin");
      expect(hasAdminPermission({ ...actor, role }, "toString")).toBe(false);
    }
    expect(hasAdminPermission(null, "words.access")).toBe(false);
    expect(
      hasAdminPermission(
        { ...actor, role: "future_role", permissions: ["words.access"] },
        "words.access"
      )
    ).toBe(false);
  });
  it("缺依赖不能使用动作权限，空数组不回退全权", () => {
    expect(
      hasAdminPermission(
        { ...actor, permissions: ["words.edit_others"] },
        "words.edit_others"
      )
    ).toBe(false);
    expect(
      hasAdminPermission(
        { ...actor, permissions: ["words.access", "words.edit_others"] },
        "words.edit_others"
      )
    ).toBe(false);
    expect(
      hasAdminPermission(
        {
          ...actor,
          permissions: ["words.access", "words.edit", "words.edit_others"]
        },
        "words.edit_others"
      )
    ).toBe(true);
    expect(hasAdminPermission(actor, "users.access")).toBe(false);
    expect(
      hasAnyAdminPermission(actor, ["words.create", "sentences.edit"])
    ).toBe(false);
  });
  it("例句编辑依赖目标只读权限，撤销后本人及他人编辑均失败关闭", () => {
    const incomplete = {
      ...actor,
      permissions: [
        "sentences.access",
        "sentences.edit",
        "sentences.edit_others"
      ]
    };
    expect(hasAdminPermission(incomplete, "sentences.edit")).toBe(false);
    expect(hasAdminPermission(incomplete, "sentences.edit_others")).toBe(false);
    expect(
      canAdminResourceAction(incomplete, "sentences", "edit", actor.id)
    ).toBe(false);
    const editor = {
      ...actor,
      permissions: ["sentences.access", "sentences.edit", "words.access"]
    };
    expect(hasAdminPermission(editor, "words.access")).toBe(true);
    expect(canAdminResourceAction(editor, "sentences", "edit", actor.id)).toBe(
      true
    );
    expect(canAdminResourceAction(editor, "sentences", "edit", "b")).toBe(
      false
    );
    expect(hasAdminPermission(editor, "words.edit")).toBe(false);
    expect(hasAdminPermission(editor, "words.publish")).toBe(false);
    expect(
      canAdminResourceAction(
        {
          ...editor,
          permissions: [...editor.permissions, "sentences.edit_others"]
        },
        "sentences",
        "edit",
        "b"
      )
    ).toBe(true);
  });
  it("他人编辑不隐含发布、恢复、回滚；各普通生命周期动作仅本人", () => {
    const editor = {
      ...actor,
      permissions: [
        "sentences.access",
        "sentences.edit",
        "sentences.edit_others",
        "words.access"
      ]
    };
    expect(canAdminResourceAction(editor, "sentences", "edit", "b")).toBe(true);
    for (const action of [
      "publish",
      "withdraw",
      "restore",
      "rollback"
    ] as const) {
      expect(canAdminResourceAction(editor, "sentences", action, "a")).toBe(
        false
      );
      const authorized = {
        ...editor,
        permissions: [...editor.permissions, `sentences.${action}`]
      };
      expect(canAdminResourceAction(authorized, "sentences", action, "a")).toBe(
        true
      );
      expect(canAdminResourceAction(authorized, "sentences", action, "b")).toBe(
        false
      );
      expect(
        canAdminResourceAction(authorized, "sentences", action, undefined)
      ).toBe(false);
      expect(canAdminResourceAction(authorized, "sentences", action, "")).toBe(
        false
      );
      expect(
        canAdminResourceAction(
          { ...actor, role: "super_admin" },
          "sentences",
          action,
          "b"
        )
      ).toBe(true);
    }
  });
  it("敏感资料、语音消耗和配置写入都须单独授权", () => {
    const reader = {
      ...actor,
      permissions: [
        "users.access",
        "teacherapply.access",
        "teacherapply.review",
        "words.access",
        "lexicon_settings.access"
      ]
    };
    expect(hasAdminPermission(reader, "users.read_sensitive")).toBe(false);
    expect(hasAdminPermission(reader, "teacherapply.read_sensitive")).toBe(
      false
    );
    expect(hasAdminPermission(reader, "teacherapply.revoke")).toBe(false);
    expect(hasAdminPermission(reader, "speech.generate")).toBe(false);
    expect(hasAdminPermission(reader, "lexicon_settings.edit")).toBe(false);
    expect(
      hasAnyAdminPermission(reader, ["words.create", "words.detect"])
    ).toBe(false);
    expect(
      hasAnyAdminPermission(
        { ...reader, permissions: [...reader.permissions, "words.validate"] },
        ["words.edit", "words.publish", "words.validate"]
      )
    ).toBe(true);
  });
});
