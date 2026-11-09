import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localText,
  LocalWebError,
  webErrorText,
  originalText
} from "@/i18n/catalog";
import { readExcelFile } from "./excel-client";

class FakeWorker {
  static response: {
    error?: string;
    notice?: import("@/i18n/catalog").LocalText;
  };
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage() {
    this.onmessage?.({ data: FakeWorker.response } as MessageEvent);
  }
}
afterEach(() => vi.unstubAllGlobals());

describe("Excel worker 诊断边界", () => {
  it.each([true, false])(
    "worker 错误 local=%s 正确区分本地提示与未知原文",
    async (local) => {
      const message = "文件内容与扩展名不符，请另存为 Excel 文件";
      const notice = localText(
        webWordlistExcel,
        "webWordlistExcel:file_content_does_not_match_its_extension_save_it_as_an_excel_file"
      );
      FakeWorker.response = local ? { notice } : { error: message };
      vi.stubGlobal("Worker", FakeWorker);
      const file = Object.assign(new File(["fixture"], "fixture.xlsx"), {
        arrayBuffer: async () => new ArrayBuffer(4)
      });
      const error = await readExcelFile(
        file,
        new AbortController().signal
      ).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error instanceof LocalWebError).toBe(local);
      expect(webErrorText(error, originalText("fallback"))).toEqual(
        local ? notice : originalText(message)
      );
    }
  );
});
