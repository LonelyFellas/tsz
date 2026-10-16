import { createExcelTemplate, parseExcel } from "./excel";

self.onmessage = (
  event: MessageEvent<
    | { type: "parse"; buffer: ArrayBuffer; fileName: string }
    | { type: "template" }
  >
) => {
  try {
    const result =
      event.data.type === "template"
        ? createExcelTemplate()
        : parseExcel(event.data.buffer, event.data.fileName);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "无法读取文件，请检查是否损坏或加密"
    });
  }
};
