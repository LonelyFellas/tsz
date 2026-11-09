import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { localText, LocalWebError } from "@/i18n/catalog";
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
    self.postMessage(
      error instanceof LocalWebError
        ? { notice: error.notice }
        : error instanceof Error
          ? { error: error.message }
          : {
              notice: localText(
                webWordlistExcel,
                "webWordlistExcel:cannot_read_the_file_check_whether_it_is_damaged_or_encrypted"
              )
            }
    );
  }
};
