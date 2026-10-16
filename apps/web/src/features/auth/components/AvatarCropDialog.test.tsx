import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi
} from "vitest";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { exportAvatarCrop } from "../avatar-crop";

vi.mock("../avatar-crop", async (original) => ({
  ...(await original<typeof import("../avatar-crop")>()),
  exportAvatarCrop: vi.fn()
}));

let source: HTMLImageElement;
const revoke = vi.fn();
const dialogDescriptors = ["showModal", "close"].map(
  (name) =>
    [
      name,
      Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)
    ] as const
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    writable: true,
    value() {
      this.open = true;
    }
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    writable: true,
    value() {
      this.open = false;
    }
  });
});
afterAll(() => {
  for (const [name, descriptor] of dialogDescriptors) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Image", function () {
    source = document.createElement("img");
    Object.defineProperties(source, {
      naturalWidth: { value: 4000, configurable: true },
      naturalHeight: { value: 2000, configurable: true }
    });
    return source;
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar-source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <AvatarCropDialog
      file={new File(["source"], "photo.jpg", { type: "image/jpeg" })}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { ...view, onConfirm, onCancel };
}

it("等待解码后展示圆形预览；缩放、拖动及键盘调整后的导出区域与预览一致", async () => {
  const { onConfirm } = open();
  const confirm = screen.getByRole("button", { name: "确认并上传" });
  expect(confirm).toBeDisabled();
  fireEvent.load(source);
  const preview = screen.getByAltText("圆形头像预览");
  const frame = screen.getByRole("group", { name: "调整头像位置" });
  expect(frame).toHaveClass("rounded-full", "overflow-hidden");
  expect(preview).toHaveStyle({ width: "200%", left: "-50%" });
  fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
  expect(preview).toHaveStyle({ width: "400%", height: "200%" });
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
    width: 256
  } as DOMRect);
  frame.setPointerCapture = vi.fn();
  const pointer = (name: string, values: Record<string, number>) => {
    const event = new Event(name, { bubbles: true });
    Object.assign(event, {
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
      ...values
    });
    fireEvent(frame, event);
  };
  pointer("pointerdown", { clientX: 100, clientY: 100 });
  pointer("pointermove", { clientX: 484, clientY: -28 });
  pointer("lostpointercapture", {});
  expect(preview).toHaveStyle({ left: "0%", top: "-100%" });
  fireEvent.keyDown(frame, { key: "ArrowLeft" });
  expect(Number.parseFloat(preview.style.left)).toBeCloseTo(-15);
  const result = new File(["cropped"], "avatar.webp", { type: "image/webp" });
  vi.mocked(exportAvatarCrop).mockResolvedValue(result);
  fireEvent.click(confirm);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(result));
  expect(exportAvatarCrop).toHaveBeenCalledWith(source, {
    x: expect.closeTo(150),
    y: 1000,
    size: 1000
  });
});

it("取消和 Escape 均不编码图片，卸载时释放原图 URL 并恢复滚动", () => {
  const { onCancel, unmount } = open();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true })
  );
  expect(onCancel).toHaveBeenCalledTimes(2);
  expect(exportAvatarCrop).not.toHaveBeenCalled();
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:avatar-source");
  expect(document.body.style.overflow).not.toBe("hidden");
});

it("损坏图片不允许确认；编码失败可以重试", async () => {
  const view = open();
  fireEvent.error(source);
  expect(screen.getByRole("alert")).toHaveTextContent("图片无法读取");
  expect(screen.getByRole("button", { name: "确认并上传" })).toBeDisabled();
  view.unmount();
  open();
  fireEvent.load(source);
  vi.mocked(exportAvatarCrop).mockRejectedValueOnce(
    new Error("图片处理失败，请重试")
  );
  fireEvent.click(screen.getByRole("button", { name: "确认并上传" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("图片处理失败")
  );
  expect(screen.getByRole("button", { name: "确认并上传" })).toBeEnabled();
});

it("编码期间锁定确认与取消，防止重复上传", async () => {
  const { onCancel, onConfirm } = open();
  fireEvent.load(source);
  let resolve!: (file: File) => void;
  vi.mocked(exportAvatarCrop).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "确认并上传" }));
  expect(screen.getByRole("button", { name: "正在处理…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true })
  );
  expect(onCancel).not.toHaveBeenCalled();
  await act(async () => {
    resolve(new File(["done"], "avatar.webp", { type: "image/webp" }));
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
