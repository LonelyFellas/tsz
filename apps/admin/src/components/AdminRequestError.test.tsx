import { render, screen } from "@testing-library/react";
import { ClientResponseError, HttpError } from "@tsz/api-client";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { expect, it } from "vitest";
import { AdminRequestError } from "./AdminRequestError";
import { Alert, Breadcrumb, Skeleton } from "@tsz/ui/admin/display";

it("本地响应诊断和共用控件随语言更新，服务端原文及已关闭状态保留", () => {
  const local = new ClientResponseError("权限调整结果不完整，请重新查看");
  const server = new HttpError(422, "权限调整结果不完整，请重新查看");
  const content = (locale: "en-US" | "zh-Hant") => (
    <InterfaceI18nProvider locale={locale}>
      <AdminRequestError error={local} />
      <output>
        <AdminRequestError error={server} />
      </output>
      <Alert title="raw content" closable />
      <Breadcrumb items={[{ title: "raw breadcrumb" }]} />
      <Skeleton />
    </InterfaceI18nProvider>
  );
  const view = render(content("en-US"));
  expect(
    screen.getByText(
      "Could not read the service response. Refresh and check the result before trying again."
    )
  ).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
  screen.getByRole("button", { name: "Close" }).click();
  view.rerender(content("zh-Hant"));
  expect(
    screen.getByText("無法讀取服務回應，請重新整理並核對操作結果後再重試")
  ).toBeTruthy();
  expect(screen.getByText(server.message)).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "麵包屑" })).toBeTruthy();
  expect(screen.queryByText("raw content")).toBeNull();
});
