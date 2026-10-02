import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi
} from "vitest";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PrivateImage } from "./PrivateImage";

vi.mock("@/lib/request", () => ({
  api: { teacherCertification: { file: vi.fn() } }
}));

const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = Object.getOwnPropertyDescriptor(
  dialogPrototype,
  "showModal"
);
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");
const NativeURL = URL;
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

beforeAll(() => {
  Object.defineProperty(dialogPrototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }
  });
  Object.defineProperty(dialogPrototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      fireEvent(this, new Event("close"));
    }
  });
});
afterAll(() => {
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose]
  ] as const) {
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor);
    else delete (dialogPrototype as unknown as Record<string, unknown>)[name];
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private callback: (
          entries: { contentRect: { width: number; height: number } }[]
        ) => void
      ) {}
      observe() {
        this.callback([{ contentRect: { width: 600, height: 400 } }]);
      }
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
  );
  let sequence = 0;
  createObjectURL.mockImplementation(() => `blob:preview-${++sequence}`);
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  vi.mocked(api.teacherCertification.file).mockResolvedValue(
    new Blob(["test"], { type: "image/png" })
  );
  useUserStore.setState({
    user: {
      id: "u1",
      display_name: "测试用户",
      phone: "13800138000",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

it("点击材料后放大现有图片，关闭时恢复页面滚动，不重复下载", async () => {
  const user = userEvent.setup();
  render(<PrivateImage id="file-1" label="学历证书" />);
  await user.click(await screen.findByRole("button", { name: "预览学历证书" }));
  const dialog = screen.getByRole("dialog", { name: "学历证书" });
  expect(within(dialog).getByRole("img", { name: "学历证书" })).toHaveAttribute(
    "src",
    "blob:preview-1"
  );
  expect(document.body.style.overflow).toBe("hidden");
  expect(api.teacherCertification.file).toHaveBeenCalledTimes(1);
  await user.click(within(dialog).getByRole("button", { name: "关闭预览" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});

it("材料被替换后关闭旧预览，释放旧图片，不自动打开新图片", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<PrivateImage id="file-1" label="学历证书" />);
  await user.click(await screen.findByRole("button", { name: "预览学历证书" }));
  rerender(<PrivateImage id="file-2" label="学历证书" />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  await waitFor(() =>
    expect(screen.getByRole("img", { name: "学历证书" })).toHaveAttribute(
      "src",
      "blob:preview-2"
    )
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

async function openLoadedPreview() {
  const user = userEvent.setup();
  render(<PrivateImage id="file-1" label="学历证书" />);
  await user.click(await screen.findByRole("button", { name: "预览学历证书" }));
  const popup = screen.getByRole("dialog", { name: "学历证书" });
  const image = within(popup).getByRole("img", { name: "学历证书" });
  Object.defineProperties(image, {
    naturalWidth: { value: 1000 },
    naturalHeight: { value: 500 }
  });
  fireEvent.load(image);
  await waitFor(() => expect(image.style.width).toBe("600px"));
  const frame = within(popup).getByRole("group", { name: "图片查看区域" });
  frame.setPointerCapture = vi.fn();
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON: () => ({})
  });
  return { user, popup, image, frame };
}

it("旋转后重新适应查看区域，缩放可复位，重新打开恢复初始视图", async () => {
  const { user, popup, image } = await openLoadedPreview();
  await user.click(within(popup).getByRole("button", { name: "旋转图片" }));
  expect(image.style.transform).toContain("rotate(90deg)");
  expect(image.style.width).toBe("400px");
  expect(image.style.height).toBe("200px");
  await user.click(within(popup).getByRole("button", { name: "放大图片" }));
  expect(
    within(popup).getByRole("button", { name: "适应屏幕" })
  ).toHaveTextContent("150%");
  await user.click(within(popup).getByRole("button", { name: "适应屏幕" }));
  expect(image.style.transform).toContain("scale(1)");
  expect(image.style.transform).toContain("rotate(90deg)");
  await user.click(within(popup).getByRole("button", { name: "关闭预览" }));
  await user.click(screen.getByRole("button", { name: "预览学历证书" }));
  expect(screen.getByRole("button", { name: "适应屏幕" })).toHaveTextContent(
    "适应"
  );
  expect(screen.getByRole("button", { name: "缩小图片" })).toBeDisabled();
  expect(api.teacherCertification.file).toHaveBeenCalledTimes(1);
});

it("双指缩放后可单指拖动，拖动有边界，取消的触点不再移动图片", async () => {
  const { popup, image, frame } = await openLoadedPreview();
  fireEvent.pointerDown(frame, {
    pointerId: 1,
    clientX: 200,
    clientY: 200,
    button: 0
  });
  fireEvent.pointerDown(frame, {
    pointerId: 2,
    clientX: 400,
    clientY: 200,
    button: 0
  });
  fireEvent.pointerMove(frame, { pointerId: 1, clientX: 100, clientY: 200 });
  fireEvent.pointerMove(frame, { pointerId: 2, clientX: 500, clientY: 200 });
  expect(
    within(popup).getByRole("button", { name: "适应屏幕" })
  ).toHaveTextContent("200%");
  expect(image.style.transform).toContain("scale(2)");
  fireEvent.pointerUp(frame, { pointerId: 1 });
  fireEvent.pointerMove(frame, { pointerId: 2, clientX: 550, clientY: 250 });
  expect(image.style.transform).toContain("translate(50px, 50px)");
  fireEvent.pointerMove(frame, { pointerId: 2, clientX: 5000, clientY: 5000 });
  expect(image.style.transform).toContain("translate(300px, 100px)");
  fireEvent.pointerCancel(frame, { pointerId: 2 });
  const cancelledTransform = image.style.transform;
  fireEvent.pointerMove(frame, { pointerId: 2, clientX: 100, clientY: 100 });
  expect(image.style.transform).toBe(cancelledTransform);
});
