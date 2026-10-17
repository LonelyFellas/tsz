import {
  List as MuiList,
  ListItem as MuiListItem,
  Box as MuiBox,
  LinearProgress as MuiLinearProgress
} from "@mui/material";
import { AdminDialog } from "@/components/AdminDialog";
import { Button as MuiDialogButton } from "@mui/material";
import { TextareaAutosize as MuiTextareaAutosize } from "@mui/material";
import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { HttpError } from "@tsz/api-client";
import type { SharedSentence, SentencePublication } from "@tsz/types";
import { api } from "@/lib/auth";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";
export type SentencePublicationAction =
  "publish" | "history" | "withdraw" | "restore";
const titles = {
  publish: "发布例句草稿",
  history: "例句发布历史",
  withdraw: "撤回例句",
  restore: "重新展示原发布"
};
/** 打开时冻结双 revision；确定性失败要求重新加载，未知结果复用原幂等请求。 */
export function SentencePublicationModal({
  sentence,
  action,
  canPublish,
  onClose,
  onChanged
}: {
  sentence: SharedSentence;
  action: SentencePublicationAction;
  canPublish: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const canAct =
    canPublish &&
    (action !== "history" ||
      !sentence.current_publication_id ||
      !!sentence.withdrawn_at);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<SentencePublication>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const impact = useQuery({
    queryKey: [
      "sentence-withdrawal-impact",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: () => api.sentences.withdrawalImpact(sentence.id),
    enabled: action === "withdraw",
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
  const history = useInfiniteQuery({
    queryKey: [
      "sentence-publications",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: ({ pageParam }) =>
      api.sentences.publications(sentence.id, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)?.publication_number : undefined,
    enabled: action === "history"
  });
  const input = {
    base_revision: sentence.revision,
    base_lifecycle_revision: sentence.lifecycle_revision
  };
  const submit = async () => {
    if (busy.current || blocked || !canAct) return;
    if (action === "history" && !selected) return;
    if (action === "withdraw" && (!impact.data || !reason.trim())) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (action === "publish")
        await api.sentences.publish(sentence.id, key.current, input);
      else if (action === "restore")
        await api.sentences.restore(sentence.id, key.current, input);
      else if (action === "withdraw")
        await api.sentences.withdraw(sentence.id, key.current, {
          ...input,
          reason: reason.trim(),
          impact_fingerprint: impact.data!.fingerprint
        });
      else
        await api.sentences.rollback(
          sentence.id,
          selected!.id,
          key.current,
          input
        );
      onChanged();
      onClose();
    } catch (failure) {
      if (failure instanceof HttpError && failure.status < 500) {
        setBlocked(true);
        setError(`${failure.message}。请关闭窗口，刷新后重新确认。`);
      } else {
        setUncertain(true);
        setError(
          "操作结果暂时未知，请重试确认；重试复用原请求，不会重复创建发布版本。"
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <AdminDialog
      open
      title={titles[action]}
      width={800}
      onClose={onClose}
      closeDisabled={!!pending}
      escapeDisabled={!!pending}
      backdropDismiss={false}
      actions={
        <>
          <MuiDialogButton onClick={onClose} disabled={pending}>
            {"\u53D6\u6D88"}
          </MuiDialogButton>
          <MuiDialogButton
            variant="contained"
            onClick={() => void submit()}
            loading={pending}
            disabled={
              !canAct ||
              blocked ||
              (action === "history" && !selected) ||
              (action === "withdraw" &&
                (!impact.data || impact.isError || !reason.trim()))
            }
          >
            {action === "history" ? "恢复所选历史到草稿" : "确认"}
          </MuiDialogButton>
        </>
      }
    >
      <MuiStack style={{ width: "100%" }} direction="column" spacing={1}>
        <MuiAlert severity={"info"}>
          <MuiAlertTitle>
            {action === "withdraw"
              ? "撤回后例句不再公开展示，草稿、历史版本和关联仍会保留"
              : action === "restore"
                ? "恢复前重新校验当前发布版本，草稿不会发布"
                : action === "history"
                  ? "恢复历史版本会覆盖当前草稿，已发布例句须先撤回；重新公开需另行发布"
                  : "发布当前草稿为公开例句；已撤回例句会重新公开展示"}
          </MuiAlertTitle>
          {"需要对应的发布、撤回或历史恢复权限；普通管理员仅能操作本人例句。"}
        </MuiAlert>
        {action === "publish" && (
          <V3EnglishTextPreview
            value={sentence.content.sentence.en_text}
            hideCommonDialect
          />
        )}
        {action === "withdraw" && (
          <>
            {impact.isPending && (
              <MuiTypography component="span">正在核对下架影响…</MuiTypography>
            )}
            {impact.isError && (
              <MuiAlert
                action={
                  <MuiButton onClick={() => void impact.refetch()}>
                    重试
                  </MuiButton>
                }
                severity={"error"}
              >
                {"影响确认加载失败"}
              </MuiAlert>
            )}
            {impact.data && (
              <>
                <MuiTypography component="span">
                  当前发布涉及 {impact.data.targets.length} 个词义：
                </MuiTypography>
                <MuiList dense>
                  {impact.data.targets.map((target) => (
                    <MuiListItem
                      key={`${target.entry_id}:${target.sense_id}`}
                      divider
                      sx={{ gap: 2, alignItems: "flex-start" }}
                    >
                      {target.entry_id} / {target.sense_id}
                      {target.hidden ? "（宿主已隐藏）" : ""}
                    </MuiListItem>
                  ))}
                </MuiList>
              </>
            )}
            <MuiTextareaAutosize
              aria-label="下架原因"
              value={reason}
              maxLength={2000}
              disabled={pending || uncertain || blocked}
              onChange={(event) => setReason(event.target.value)}
              placeholder="填写下架原因"
              className="admin-textarea"
            />
          </>
        )}
        {action === "history" && (
          <>
            {history.isError && (
              <MuiAlert
                action={
                  <MuiButton onClick={() => void history.refetch()}>
                    重试
                  </MuiButton>
                }
                severity={"error"}
              >
                {"发布历史加载失败"}
              </MuiAlert>
            )}
            <MuiBox aria-busy={history.isPending}>
              {history.isPending && <MuiLinearProgress aria-label="正在加载" />}
              <MuiList dense>
                {(history.data?.pages.flat() ?? []).map((publication) => (
                  <MuiListItem
                    key={publication.id}
                    divider
                    sx={{ gap: 2, alignItems: "flex-start" }}
                  >
                    <MuiStack direction="column" spacing={1}>
                      <MuiTypography component="span">
                        版本 {publication.publication_number} ·{" "}
                        {new Date(publication.published_at).toLocaleString(
                          "zh-CN"
                        )}
                      </MuiTypography>
                      <V3EnglishTextPreview
                        value={publication.snapshot.sentence.en_text}
                        hideCommonDialect
                      />
                    </MuiStack>
                    <MuiBox sx={{ ml: "auto" }}>
                      {canAct
                        ? [
                            <MuiButton
                              key="select"
                              disabled={pending || uncertain || blocked}
                              onClick={() => setSelected(publication)}
                            >
                              {selected?.id === publication.id
                                ? "已选择"
                                : "选择恢复"}
                            </MuiButton>
                          ]
                        : []}
                    </MuiBox>
                  </MuiListItem>
                ))}
              </MuiList>
            </MuiBox>
            {history.hasNextPage && (
              <MuiButton
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                加载更早历史
              </MuiButton>
            )}
          </>
        )}
        {error && <MuiAlert severity={"error"}>{error}</MuiAlert>}
      </MuiStack>
    </AdminDialog>
  );
}
