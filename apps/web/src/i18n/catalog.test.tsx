import { readFileSync, globSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import ts from "typescript";
import { act, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createInterfaceI18n, INTERFACE_LOCALES } from "@tsz/shared/i18n";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import {
  addWebCatalog,
  defineWebMessages,
  localText,
  originalText,
  webCommon,
  webErrorText,
  webText,
  type WebCatalog
} from "./catalog";
import {
  ClientResponseError,
  HttpError,
  RequestTimeoutError
} from "@tsz/api-client";
import { useWebText } from "./client";
import { webWordlistInteractions as webWordlist } from "./messages/wordlist/interactions";

const modules = import.meta.glob<{ [key: string]: WebCatalog }>(
  "./messages/**/*.ts",
  { eager: true }
);
const catalogs = [
  webCommon,
  ...Object.values(modules).flatMap((module) => Object.values(module))
] as WebCatalog[];
const placeholders = (value: string) =>
  [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

describe("Web 界面目录", () => {
  it("每个命名空间的键、非空译文、参数和复数形式有效", () => {
    const namespaces = new Set<string>();
    for (const catalog of catalogs) {
      expect(namespaces.has(catalog.namespace), catalog.namespace).toBe(false);
      namespaces.add(catalog.namespace);
      expect(catalog.keys.size, catalog.namespace).toBe(
        Object.keys(catalog.messages).length
      );
      for (const [key, row] of Object.entries(catalog.messages)) {
        expect(key).toMatch(/^[a-z0-9][a-z0-9_]*$/);
        for (const value of row) {
          expect(value.trim(), `${catalog.namespace}.${key}`).not.toBe("");
          expect(placeholders(value), `${catalog.namespace}.${key}`).toEqual(
            placeholders(row[0])
          );
        }
        for (const brand of ["天生会背", "天生币"])
          if (row[0].includes(brand))
            for (const value of row)
              expect(value, `${catalog.namespace}.${key} brand`).toContain(
                brand
              );
        if (row[0].includes("词条名称 / 释义 / 注释"))
          for (const value of row)
            expect(value, `${catalog.namespace}.${key} file headers`).toContain(
              "词条名称 / 释义 / 注释"
            );
        const plural = catalog.plurals[key];
        if (plural) {
          expect(placeholders(plural.one)).toEqual(placeholders(row[0]));
          expect(row[0]).toContain(`{{${plural.parameter}}}`);
          const instance = createInterfaceI18n("en-GB", catalog.resources);
          const text = webText(instance, catalog);
          expect(text(row[0], { [plural.parameter]: 1 })).toBe(
            plural.one.replaceAll(`{{${plural.parameter}}}`, "1")
          );
          expect(text(row[0], { [plural.parameter]: 2 })).toBe(
            row[2].replaceAll(`{{${plural.parameter}}}`, "2")
          );
        }
      }
    }
  });

  it("共用鉴权、校验和用户标签的固定提示均有通用翻译", () => {
    const repo = fileURLToPath(new NodeURL("../../../../", import.meta.url));
    const missing: string[] = [];
    for (const helper of [
      "apps/web/src/features/auth/shared.ts",
      "packages/shared/src/auth/errors.ts",
      "packages/shared/src/validate.ts",
      "apps/web/src/lib/user.ts"
    ]) {
      const parsed = ts.createSourceFile(
        helper,
        readFileSync(`${repo}/${helper}`, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) &&
          /[\p{Script=Han}]/u.test(node.text) &&
          !webCommon.keys.has(node.text)
        )
          missing.push(`${helper}: ${node.text}`);
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }
    expect(missing).toEqual([]);
  });

  it("直接调用的固定文案存在于调用方命名空间，拆包不产生漏译", () => {
    const base = fileURLToPath(new NodeURL("../", import.meta.url));
    const missing: string[] = [];
    for (const file of globSync("**/*.{ts,tsx}", { cwd: base })) {
      if (
        file.includes(".test.") ||
        file.includes(".fixture.") ||
        file.startsWith("i18n/messages/")
      )
        continue;
      const source = readFileSync(`${base}/${file}`, "utf8");
      const catalogsForFile = [
        ...source.matchAll(/from "@\/i18n\/messages\/([^";]+)"/g)
      ].flatMap((match) =>
        Object.values(modules[`./messages/${match[1]}.ts`] ?? {})
      );
      if (!catalogsForFile.length) continue;
      const known = new Set(
        [webCommon, ...catalogsForFile].flatMap((catalog) => [
          ...catalog.keys.keys()
        ])
      );
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true
      );
      const auditParams = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ["uiText", "localText"].includes(node.expression.getText(parsed))
        )
          return;
        if (
          ts.isStringLiteral(node) &&
          /[\p{Script=Han}]/u.test(node.text) &&
          !["天生币", "天生会背"].includes(node.text.trim())
        )
          missing.push(`${file}: untranslated interpolation ${node.text}`);
        if (
          ts.isElementAccessExpression(node) &&
          [
            "LABELS",
            "CHANNEL_LABEL",
            "STATE_LABEL",
            "VARIANT_LABEL",
            "importFieldLabels",
            "runLabels",
            "planStatusLabels",
            "SORT_LABELS"
          ].includes(node.expression.getText(parsed))
        )
          missing.push(`${file}: untranslated label map interpolation`);
        ts.forEachChild(node, auditParams);
      };
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText(parsed) === "key" &&
          node.initializer?.getText(parsed).includes("uiText(")
        )
          missing.push(`${file}: translated React key`);
        if (
          ts.isCallExpression(node) &&
          ["uiText", "localText"].includes(node.expression.getText(parsed))
        ) {
          const first = node.arguments[0];
          const fixed = (value: ts.Node) => {
            if (ts.isCallExpression(value)) return;
            if (ts.isConditionalExpression(value)) {
              fixed(value.whenTrue);
              fixed(value.whenFalse);
              return;
            }
            if (ts.isStringLiteral(value) && !known.has(value.text))
              missing.push(`${file}: ${value.text}`);
            ts.forEachChild(value, fixed);
          };
          if (
            first &&
            (ts.isStringLiteral(first) || ts.isConditionalExpression(first))
          )
            fixed(first);
          if (node.arguments[1]) auditParams(node.arguments[1]);
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(parsed) === "uiText" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          !known.has(node.arguments[0].text)
        )
          missing.push(`${file}: ${node.arguments[0].text}`);
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }
    expect(missing).toEqual([]);
  });

  it("按需装配的资源在实例之间隔离，不能污染静态目录", () => {
    const first = createInterfaceI18n("en-GB");
    const second = createInterfaceI18n("en-GB");
    addWebCatalog(first, webWordlist);
    addWebCatalog(second, webWordlist);
    const key = webWordlist.keys.get("收藏")!;
    first.addResource(
      "en",
      webWordlist.namespace,
      key,
      "changed in one request"
    );
    expect(webText(second, webWordlist)("收藏")).toBe("Favourite");
    expect(webWordlist.messages[key]?.[2]).toBe("Favourite");
  });

  it("通知复数和整句插值保留原始昵称、词表名与精确金额", () => {
    const catalog = catalogs.find(
      (value) => value.namespace === "webTeacherCertificationNotifications"
    )!;
    const text = webText(
      createInterfaceI18n("en-GB", catalog.resources),
      catalog
    );
    expect(text("{{v0}} 条未读通知", { v0: 1 })).toBe("1 unread notification");
    expect(text("{{v0}} 条未读通知", { v0: 2 })).toBe("2 unread notifications");
    expect(
      text("{{actor}}赞了你的词表「{{wordlist}}」。", {
        actor: "保存",
        wordlist: "取消"
      })
    ).toBe("保存 liked your word list “取消”.");
    expect(
      text("{{actor}}向你的词表「{{wordlist}}」投了 {{amount}}。", {
        actor: "原名",
        wordlist: "原文",
        amount: "9,223,372,036,854,775,807 天生币"
      })
    ).toContain("9,223,372,036,854,775,807 天生币");
  });

  it("未知服务端原文即使恰好与本地文案相同也不会被翻译", () => {
    const instance = createInterfaceI18n("en-US", webWordlist.resources);
    addWebCatalog(instance, webCommon);
    const text = webText(instance, webWordlist);
    expect(text("余额不足，请查看钱包。")).toBe(
      "Insufficient balance. Check your wallet."
    );
    expect(
      text(
        webErrorText(new HttpError(422, "余额不足，请查看钱包。"), "fallback")
      )
    ).toBe("余额不足，请查看钱包。");
    expect(text(originalText("<img src=x> 用户正文"))).toBe(
      "<img src=x> 用户正文"
    );
    expect(
      text(
        webErrorText(
          new ClientResponseError("private protocol path"),
          "fallback"
        )
      )
    ).toBe("Data are unavailable. Reload and try again.");
    expect(
      text(webErrorText(new RequestTimeoutError("POST"), "fallback"))
    ).toContain("result is unconfirmed");
  });

  it("本地模板和原始插值保留到显示时，英美覆盖保持独立", () => {
    const notice = localText("已投出 {{v0}}，作者已收到。", {
      v0: "9,223,372,036,854,775,807"
    });
    const uk = createInterfaceI18n("en-GB", webWordlist.resources);
    const us = createInterfaceI18n("en-US", webWordlist.resources);
    expect(webText(uk, webWordlist)(notice)).toContain(
      "9,223,372,036,854,775,807"
    );
    expect(webText(uk, webWordlist)("收藏")).toBe("Favourite");
    expect(webText(us, webWordlist)("收藏")).toBe("Favorite");
    expect(
      webText(
        createInterfaceI18n("zh-Hant", webWordlist.resources),
        webWordlist
      )(notice)
    ).toContain("已投出");
  });
});

const sample = defineWebMessages("webHydrationSample", {
  label: ["输入", "輸入", "Input"],
  saving: ["保存中…", "儲存中…", "Saving…"]
} as const);
function InputSample() {
  const text = useWebText(sample);
  return (
    <>
      <label>
        {text("输入")}
        <input defaultValue="原始 word" />
      </label>
      <span>{text("保存中…")}</span>
    </>
  );
}

describe("Web 首屏和原位语言切换", () => {
  it.each(INTERFACE_LOCALES)(
    "%s SSR 与首次水合一致，实例互不污染",
    async (locale) => {
      const tree = (
        <InterfaceI18nProvider locale={locale}>
          <InputSample />
        </InterfaceI18nProvider>
      );
      const other = renderToString(
        <InterfaceI18nProvider locale="zh-Hans">
          <InputSample />
        </InterfaceI18nProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(tree);
      const html = container.innerHTML;
      const onRecoverableError = vi.fn();
      const root = hydrateRoot(container, tree, { onRecoverableError });
      try {
        await act(async () => {});
        expect(container.innerHTML).toBe(html);
        expect(onRecoverableError).not.toHaveBeenCalled();
        expect(other).toContain("输入");
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it("切换保留输入 DOM、焦点与选区，不重建待处理操作", () => {
    const tree = (locale: "en-GB" | "zh-Hant") => (
      <InterfaceI18nProvider locale={locale}>
        <InputSample />
      </InterfaceI18nProvider>
    );
    const view = render(tree("en-GB"));
    const input = screen.getByRole("textbox", {
      name: "Input"
    }) as HTMLInputElement;
    input.value = "draft 中文 word";
    input.focus();
    input.setSelectionRange(2, 7);
    view.rerender(tree("zh-Hant"));
    expect(screen.getByRole("textbox", { name: "輸入" })).toBe(input);
    expect(input).toHaveValue("draft 中文 word");
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
    expect(screen.getByText("儲存中…")).toBeInTheDocument();
  });
});
