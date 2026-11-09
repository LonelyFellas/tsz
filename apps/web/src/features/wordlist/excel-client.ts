import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { localText, type LocalText, LocalWebError } from "@/i18n/catalog";

import type { ExcelRow } from "./excel-rows";

function runWorker<T>(request: object, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel.worker.ts", import.meta.url), {
      type: "module"
    });
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("已取消", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new LocalWebError(
          localText(
            webWordlistExcel,
            "webWordlistExcel:file_processing_timed_out_split_it_and_try_again"
          )
        )
      );
    }, 15000);
    worker.onmessage = (
      event: MessageEvent<{ result: T; error?: string; notice?: LocalText }>
    ) => {
      finish();
      if (event.data.notice) reject(new LocalWebError(event.data.notice));
      else if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      finish();
      reject(
        new LocalWebError(
          localText(
            webWordlistExcel,
            "webWordlistExcel:could_not_read_the_file_choose_it_again"
          )
        )
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(request);
  });
}

export async function readExcelFile(file: File, signal: AbortSignal) {
  if (!/\.(xls|xlsx)$/i.test(file.name))
    throw new LocalWebError(
      localText(webWordlistExcel, "webWordlistExcel:choose_an_xls_or_xlsx_file")
    );
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:the_file_must_be_larger_than_0_and_no_more_than_10_mb"
      )
    );
  const buffer = await file.arrayBuffer();
  return runWorker<ExcelRow[]>(
    { type: "parse", buffer, fileName: file.name },
    signal
  );
}

export async function downloadExcelTemplate(signal: AbortSignal) {
  const buffer = await runWorker<ArrayBuffer>({ type: "template" }, signal);
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "词表导入模板.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
