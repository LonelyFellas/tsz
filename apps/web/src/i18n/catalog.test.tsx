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
  type WebValues,
  type WebCatalog
} from "./catalog";
import {
  ClientResponseError,
  HttpError,
  RequestTimeoutError
} from "@tsz/api-client";
import { webTeacherCertificationNotifications } from "./messages/teacher-certification/notifications";
import { webTask } from "./messages/task";
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
      expect(
        Object.keys(catalog.messages).length,
        catalog.namespace
      ).toBeGreaterThan(0);
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
          // 数量可以只决定单位的单复数，不必插入文本。
          if (placeholders(row[0]).length > 0)
            expect(row[0]).toContain(`{{${plural.parameter}}}`);
          const instance = createInterfaceI18n("en-GB", catalog.resources);
          // 该循环只使用刚从目录枚举、校验的键和参数，覆盖运行时资源边界。
          const text = webText(instance, catalog) as (
            key: string,
            values?: WebValues
          ) => string;
          expect(
            text(`${catalog.namespace}:${key}`, { [plural.parameter]: 1 })
          ).toBe(plural.one.replaceAll(`{{${plural.parameter}}}`, "1"));
          expect(
            text(`${catalog.namespace}:${key}`, { [plural.parameter]: 2 })
          ).toBe(row[2].replaceAll(`{{${plural.parameter}}}`, "2"));
        }
      }
    }
  });

  it("所有作者文案使用已登记稳定键；插值中的作者标签显式翻译，React key 保持稳定", () => {
    const base = fileURLToPath(new NodeURL("../", import.meta.url));
    const missing: string[] = [];
    const known = new Set(
      catalogs.flatMap((catalog) =>
        Object.keys(catalog.messages).map(
          (key) => `${catalog.namespace}:${key}`
        )
      )
    );
    const registrations = readFileSync(`${base}/i18n/types.ts`, "utf8");
    for (const catalog of catalogs)
      expect(registrations).toContain(`${catalog.namespace}:`);
    for (const file of globSync("**/*.{ts,tsx}", { cwd: base })) {
      if (
        file.includes(".test.") ||
        file.includes(".type-test.") ||
        file.includes(".fixture.") ||
        file.startsWith("i18n/messages/")
      )
        continue;
      const source = readFileSync(`${base}/${file}`, "utf8");
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true
      );
      const auditParams = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ["uiText", "localText", "originalText"].includes(
            node.expression.getText(parsed)
          )
        )
          return;
        if (
          ts.isStringLiteral(node) &&
          /[\p{Script=Han}]/u.test(node.text) &&
          !["天生币", "天生会背"].includes(node.text.trim())
        )
          missing.push(`${file}: untranslated interpolation ${node.text}`);
        ts.forEachChild(node, auditParams);
      };
      const fixed = (value: ts.Node) => {
        if (ts.isConditionalExpression(value)) {
          fixed(value.whenTrue);
          fixed(value.whenFalse);
        } else if (
          ts.isStringLiteral(value) &&
          value.text &&
          !known.has(value.text)
        )
          missing.push(`${file}: ${value.text}`);
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
          const offset =
            node.expression.getText(parsed) === "localText" ? 1 : 0;
          if (node.arguments[offset]) fixed(node.arguments[offset]!);
          if (node.arguments[offset + 1])
            auditParams(node.arguments[offset + 1]!);
        }
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
    const key = "favourites";
    first.addResource(
      "en",
      webWordlist.namespace,
      key,
      "changed in one request"
    );
    expect(
      webText(second, webWordlist)("webWordlistInteractions:favourites")
    ).toBe("Favourite");
    expect(webWordlist.messages[key]?.[2]).toBe("Favourite");
  });

  it("通知复数和整句插值保留原始昵称、词表名与精确金额", () => {
    const catalog = webTeacherCertificationNotifications;
    const text = webText(
      createInterfaceI18n("en-GB", catalog.resources),
      catalog
    );
    expect(
      text("webTeacherCertificationNotifications:v0_unread_notifications", {
        v0: 1
      })
    ).toBe("1 unread notification");
    expect(
      text("webTeacherCertificationNotifications:v0_unread_notifications", {
        v0: 2
      })
    ).toBe("2 unread notifications");
    expect(
      text("webTeacherCertificationNotifications:wordlist_liked_body", {
        actor: "保存",
        wordlist: "取消"
      })
    ).toBe("保存 liked your word list “取消”.");
    expect(
      text("webTeacherCertificationNotifications:wordlist_tipped_body", {
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
    expect(
      text("webWordlistInteractions:insufficient_balance_check_your_wallet")
    ).toBe("Insufficient balance. Check your wallet.");
    expect(
      text(
        webErrorText(
          new HttpError(422, "余额不足，请查看钱包。"),
          originalText("fallback")
        )
      )
    ).toBe("余额不足，请查看钱包。");
    expect(text(originalText("<img src=x> 用户正文"))).toBe(
      "<img src=x> 用户正文"
    );
    expect(
      text(
        webErrorText(
          new ClientResponseError("private protocol path"),
          originalText("fallback")
        )
      )
    ).toBe("Data are unavailable. Reload and try again.");
    expect(
      text(
        webErrorText(new RequestTimeoutError("POST"), originalText("fallback"))
      )
    ).toContain("result is unconfirmed");
  });

  it("本地模板和原始插值保留到显示时，英美覆盖保持独立", () => {
    const notice = localText(
      webWordlist,
      "webWordlistInteractions:tipped_v0_the_author_has_received_it",
      {
        v0: "9,223,372,036,854,775,807"
      }
    );
    const uk = createInterfaceI18n("en-GB", webWordlist.resources);
    const us = createInterfaceI18n("en-US", webWordlist.resources);
    expect(webText(uk, webWordlist)(notice)).toContain(
      "9,223,372,036,854,775,807"
    );
    expect(webText(uk, webWordlist)("webWordlistInteractions:favourites")).toBe(
      "Favourite"
    );
    expect(webText(us, webWordlist)("webWordlistInteractions:favourites")).toBe(
      "Favorite"
    );
    expect(
      webText(
        createInterfaceI18n("zh-Hant", webWordlist.resources),
        webWordlist
      )(notice)
    ).toContain("已投出");
  });
  it("跨模块本地通知显式携带目录，跨线程后按需装配且不污染另一实例", () => {
    const notice = structuredClone(
      localText(webTask, "webTask:v0_practice", {
        v0: originalText("保存 {{v0}} $t(webCommon:user)")
      })
    );
    const first = createInterfaceI18n("en-US");
    const second = createInterfaceI18n("en-US");
    expect(first.hasResourceBundle("en", webTask.namespace)).toBe(false);
    expect(webText(first, webWordlist)(notice)).toBe(
      "保存 {{v0}} $t(webCommon:user) practice"
    );
    expect(first.hasResourceBundle("en", webTask.namespace)).toBe(true);
    expect(second.hasResourceBundle("en", webTask.namespace)).toBe(false);
    expect(
      webText(first, webWordlist)(originalText("webTask:v0_practice"))
    ).toBe("webTask:v0_practice");
  });

  it("嵌套作者标签只翻译显式本地消息，精确大整数复数不丢失文本", () => {
    const instance = createInterfaceI18n("en-US");
    const text = webText(instance, webWordlist);
    expect(
      text(
        localText(webCommon, "webCommon:show_field", {
          label: localText(webWordlist, "webWordlistInteractions:favourites")
        })
      )
    ).toBe("Show Favorite");
    const count = BigInt("9223372036854775807");
    expect(
      webText(instance, webTeacherCertificationNotifications)(
        "webTeacherCertificationNotifications:v0_unread_notifications",
        { v0: count }
      )
    ).toBe("9223372036854775807 unread notifications");
    expect(
      webText(instance, webTeacherCertificationNotifications)(
        "webTeacherCertificationNotifications:v0_unread_notifications",
        { v0: 1n }
      )
    ).toBe("1 unread notification");
  });

  it("中文译文修改不改变调用键，运行时拒绝未知键而非静默显示源文", () => {
    const before = defineWebMessages("webCopyChange", {
      label: ["旧译文", "原譯文", "Label"]
    });
    const after = defineWebMessages("webCopyChange", {
      label: ["新译文", "新譯文", "Label"]
    });
    expect(
      webText(createInterfaceI18n("zh-Hans"), before)("webCopyChange:label")
    ).toBe("旧译文");
    expect(
      webText(createInterfaceI18n("zh-Hans"), after)("webCopyChange:label")
    ).toBe("新译文");
    expect(() =>
      Reflect.apply(webText(createInterfaceI18n(), before), null, [
        "未知界面文案"
      ])
    ).toThrow("Unregistered Web translation");
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
        {text("webHydrationSample:label")}
        <input defaultValue="原始 word" />
      </label>
      <span>{text("webHydrationSample:saving")}</span>
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
