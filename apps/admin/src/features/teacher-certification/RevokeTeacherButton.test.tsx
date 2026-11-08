import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@tsz/ui/admin/overlays";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { expect, it, vi } from "vitest";
import { RevokeTeacherButton } from "./RevokeTeacherButton";
const revoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  usePermission: () => true,
  api: { teacherCertification: { revoke } }
}));
it("直接撤销入口切换语言保留原因与显式确认，在途不重复请求", async () => {
  let finish!: () => void;
  revoke.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done;
      })
  );
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    }),
    success = vi.fn();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <App>
          <RevokeTeacherButton userId="u7" onSuccess={success} />
        </App>
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  fireEvent.click(screen.getByRole("button", { name: "撤销教师资格" }));
  const dialog = screen.getByRole("dialog", { name: "撤销教师资格" });
  fireEvent.click(within(dialog).getByRole("button", { name: "确认撤销" }));
  await screen.findByText("请填写撤销原因");
  view.rerender(content("zh-Hant"));
  expect(screen.getByText("請填寫撤銷原因")).toBeVisible();
  const input = screen.getByRole("textbox", { name: "撤銷原因" });
  fireEvent.change(input, { target: { value: "  原始原因 centre  " } });
  view.rerender(content("en-US"));
  expect(input).toHaveValue("  原始原因 centre  ");
  expect(revoke).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm revocation" })
  );
  await waitFor(() =>
    expect(revoke).toHaveBeenCalledExactlyOnceWith("u7", "原始原因 centre")
  );
  view.rerender(content("zh-Hant"));
  expect(input).toBeDisabled();
  expect(input).toHaveValue("  原始原因 centre  ");
  expect(success).not.toHaveBeenCalled();
  await act(async () => finish());
  await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
});
