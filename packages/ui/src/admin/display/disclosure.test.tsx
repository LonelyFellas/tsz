import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it } from "vitest";
import { Image } from "./disclosure";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";

it("键盘查看成组材料可切换大图和缩放，离开材料面板会移除预览", async () => {
  const view = render(
    <Image.PreviewGroup>
      <Image src="/certificate.jpg" alt="资格证书" />
      <Image src="/identity.jpg" alt="身份材料" />
    </Image.PreviewGroup>
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "资格证书" }), {
    key: "Enter"
  });
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("img", { name: "资格证书" })).toHaveAttribute(
    "src",
    "/certificate.jpg"
  );
  fireEvent.keyDown(window, { key: "ArrowRight", keyCode: 39 });
  const second = await within(dialog).findByRole("img", { name: "身份材料" });
  expect(second).toHaveAttribute("src", "/identity.jpg");
  const before = second.style.transform;
  fireEvent.click(within(dialog).getByRole("button", { name: "放大" }));
  await waitFor(() => expect(second.style.transform).not.toBe(before));
  view.unmount();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("预览按钮随语言切换并保留缩放限制和操作", async () => {
  const content = (locale: "en-US" | "zh-Hant") => (
    <InterfaceI18nProvider locale={locale}>
      <Image src="/certificate.jpg" alt="资格证书" />
    </InterfaceI18nProvider>
  );
  const view = render(content("en-US"));
  fireEvent.keyDown(screen.getByRole("button", { name: "资格证书" }), {
    key: "Enter"
  });
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Zoom out" })
  ).toBeDisabled();
  const image = within(dialog).getByRole("img", { name: "资格证书" });
  const before = image.style.transform;
  view.rerender(content("zh-Hant"));
  fireEvent.click(within(dialog).getByRole("button", { name: "放大" }));
  await waitFor(() => expect(image.style.transform).not.toBe(before));
  expect(
    within(dialog).getByRole("button", { name: "縮小" })
  ).not.toBeDisabled();
  expect(
    within(dialog).getByRole("button", { name: "水平翻轉" })
  ).toBeInTheDocument();
});
