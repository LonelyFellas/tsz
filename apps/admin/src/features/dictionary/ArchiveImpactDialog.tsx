import { Alert, Button, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { EntryLifecycleTarget } from "@tsz/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { adminWordsDataSource } from "./dataSource";

type Impact = Awaited<ReturnType<typeof adminWordsDataSource.archiveImpact>>;
export function ArchiveImpactDialog({
  entries,
  title,
  onClose,
  onConfirm,
  onRefresh,
  describeFailure
}: {
  entries: EntryLifecycleTarget[];
  title: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onRefresh: () => void;
  describeFailure: (error: unknown, fallback: string) => string;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; impact: Impact }
    | { status: "error"; error: unknown }
  >({ status: "loading" });
  const [revision, setRevision] = useState(0),
    [pending, setPending] = useState(false);
  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    void adminWordsDataSource.archiveImpact({ entries }).then(
      (impact) => {
        if (current) setState({ status: "ready", impact });
      },
      (error) => {
        if (current) setState({ status: "error", error });
      }
    );
    return () => {
      current = false;
    };
  }, [entries, revision]);
  const error = state.status === "error" ? state.error : undefined;
  const refreshRequired =
    error instanceof HttpError &&
    (error.status === 409 || error.code === "word_not_found");
  const retryable =
    !refreshRequired &&
    !(error instanceof HttpError && [401, 403].includes(error.status));
  return (
    <ConfirmDialog
      open
      title={title}
      confirmText="移入垃圾桶"
      danger
      confirmDisabled={state.status !== "ready"}
      pending={pending}
      onClose={onClose}
      onConfirm={() => {
        if (pending || state.status !== "ready") return;
        setPending(true);
        void onConfirm()
          .then(onClose)
          .finally(() => setPending(false));
      }}
    >
      {state.status === "loading" ? (
        <Typography>正在检查词表和练习的影响…</Typography>
      ) : state.status === "ready" ? (
        <>
          <p>
            将使 {state.impact.wordlist_count} 张词表中的引用不可用，可能影响{" "}
            {state.impact.active_run_count} 轮尚未结束的练习。
          </p>
          <p>
            发布记录会保留。恢复词条后，词表可以重新展示；已失效的练习需要重新开始。
          </p>
          <p>
            如果只是修正内容，请取消并编辑词条。引用数量可能随新操作变化，其他关联仍须先解除。
          </p>
        </>
      ) : (
        <>
          <Alert severity="error">
            {refreshRequired
              ? "词条已发生变化，请刷新列表后重新确认；尚未移入垃圾桶。"
              : retryable
                ? "无法读取影响，请重试；尚未移入垃圾桶。"
                : describeFailure(error, "无法读取归档影响")}
          </Alert>
          {refreshRequired ? (
            <Button onClick={onRefresh}>刷新列表并重新确认</Button>
          ) : retryable ? (
            <Button onClick={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          ) : null}
        </>
      )}
    </ConfirmDialog>
  );
}
