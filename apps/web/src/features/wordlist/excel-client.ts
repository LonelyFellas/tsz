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
      reject(new Error("文件处理超时，请拆分后重试"));
    }, 15000);
    worker.onmessage = (event: MessageEvent<{ result: T; error?: string }>) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("文件读取失败，请重新选择文件"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(request);
  });
}

export async function readExcelFile(file: File, signal: AbortSignal) {
  if (!/\.(xls|xlsx)$/i.test(file.name))
    throw new Error("请选择 .xls 或 .xlsx 文件");
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("文件须大于 0 且不超过 10 MB");
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
