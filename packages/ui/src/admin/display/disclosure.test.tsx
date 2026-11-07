import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it } from "vitest";
import { Image } from "./disclosure";

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
  fireEvent.click(within(dialog).getByRole("button", { name: "zoomIn" }));
  await waitFor(() => expect(second.style.transform).not.toBe(before));
  view.unmount();
  expect(screen.queryByRole("dialog")).toBeNull();
});
