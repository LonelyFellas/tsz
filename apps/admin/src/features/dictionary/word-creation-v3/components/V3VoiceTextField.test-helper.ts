import { act, fireEvent, waitFor, within } from "@testing-library/react";

export async function changeVoiceText(
  input: HTMLElement,
  event: { target: { value: string } }
) {
  if (!(input as HTMLInputElement).readOnly) {
    fireEvent.change(input, event);
    return;
  }
  const label = input.getAttribute("aria-label")!;
  const field = input.closest<HTMLElement>(".v3-voice-text-field-compact");
  if (!field) throw new Error("语音字段缺少编辑入口");
  await act(async () => {
    fireEvent.click(within(field).getByLabelText(`打开${label}编辑器`));
    await import("@tsz/voice-editor/editor");
  });
  // 工具栏使用明确的公开角色和名称，避免每次轮询扫描整个大表单的 label 关联。
  const toolbar = await waitFor(
    () => {
      const matches = document.querySelectorAll<HTMLElement>(
        '[role="toolbar"][aria-label="标注工具栏"]'
      );
      if (matches.length !== 1) throw new Error("等待唯一的标注工具栏");
      return matches[0]!;
    },
    { timeout: 10000 }
  );
  const dialog = toolbar.closest('[role="dialog"]')! as HTMLElement;
  fireEvent.change(within(dialog).getByLabelText(label), event);
  const confirm = within(dialog).queryByText("确认修改", {
    selector: "button span"
  });
  if (confirm) fireEvent.click(confirm);
  fireEvent.click(within(dialog).getByLabelText(`完成${label}编辑`));
  if (within(dialog).queryByText(/已规范化拼写/)) {
    fireEvent.click(within(dialog).getByLabelText(`完成${label}编辑`));
  }
}
