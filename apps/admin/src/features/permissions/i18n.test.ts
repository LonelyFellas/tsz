import { expect, it } from "vitest";
import { createInterfaceI18n } from "@tsz/shared/i18n";
import { HttpError } from "@tsz/api-client";
import { adminActionError } from "../admins/labels";
import { roleMutationError } from "../roles/labels";
import { accessLabel, accessResources, type AccessTranslation } from "./i18n";

it("仅映射已知目录显示，未知或变更原文及未知服务端错误不被替换", () => {
  const instance = createInterfaceI18n("en-US", accessResources);
  const t: AccessTranslation = (key, values) =>
    instance.t(key, { ns: "adminAccess", ...values });
  const catalog = {
    key: "words.access",
    label: "查看词条",
    description: "新版本说明：查看词条 / raw 001",
    catalog_version: "unchanged"
  };
  const before = JSON.stringify(catalog);
  expect(accessLabel(catalog.label, t)).toBe("View entries");
  expect(accessLabel(catalog.description, t)).toBe(catalog.description);
  expect(accessLabel("future_raw_permission", t)).toBe("future_raw_permission");
  expect(
    adminActionError(new HttpError(500, "创建失败"), "reset", "fallback", t)
  ).toBe("创建失败");
  expect(roleMutationError(new Error("创建失败"), "fallback", t)).toBe(
    "创建失败"
  );
  expect(JSON.stringify(catalog)).toBe(before);
});
