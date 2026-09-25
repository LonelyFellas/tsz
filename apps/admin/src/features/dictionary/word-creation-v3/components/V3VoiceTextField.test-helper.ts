import { fireEvent, screen, within } from "@testing-library/react";

export async function changeVoiceText(
  input: HTMLElement,
  event: { target: { value: string } }
) {
  if (!(input as HTMLInputElement).readOnly) {
    fireEvent.change(input, event);
    return;
  }
  const label = input.getAttribute("aria-label")!;
  fireEvent.click(screen.getByLabelText(`打开${label}编辑器`));
  const toolbar = await screen.findByLabelText(
    "标注工具栏",
    {},
    { timeout: 10000 }
  );
  const dialog = toolbar.closest('[role="dialog"]')! as HTMLElement;
  fireEvent.change(within(dialog).getByLabelText(label), event);
  const confirm = screen.queryByText("确认修改", { selector: "button span" });
  if (confirm) fireEvent.click(confirm);
  fireEvent.click(within(dialog).getByLabelText(`完成${label}编辑`));
}
