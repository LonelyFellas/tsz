import { useFormTypeLabel } from "./part-of-speech/FormTypeLabels";
import ExpandMore from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "./surfaceSnapshot";
import type { SurfaceMatchPageV3 } from "@tsz/types";

export function LifecycleSurfaceConfirmation({
  state,
  onConfirm,
  onRestart,
  confirming,
  action = "restore"
}: {
  state: SurfaceSnapshotState<SurfaceMatchPageV3> & { retry: () => void };
  onConfirm: () => void;
  onRestart: () => void;
  confirming: boolean;
  action?: "restore" | "rollback" | "publish";
}) {
  const formTypeLabel = useFormTypeLabel();
  const cards = aggregateLifecycleSurfaceMatchCards(state, formTypeLabel);
  const groups = [
    ["visibility", "仅公开可见性"],
    ["ordinary", "仅普通同形提示"],
    ["composite", "公开可见性 + 普通同形提示"]
  ]
    .map(([key, title]) => ({
      key,
      title,
      cards: cards.filter((card) => card.membership === key)
    }))
    .filter((group) => group.cards.length > 0);
  const disabled = state.phase === "disabled";
  const isActivation = action === "rollback";
  const actionLabel =
    action === "publish" ? "发布" : isActivation ? "回退" : "恢复";
  const statusLabel = {
    draft: "草稿",
    published: "已发布",
    archived: "垃圾桶"
  } as const;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {disabled
          ? "学习端暂不支持多个同名公开词条"
          : `${actionLabel}前需要确认同名公开范围`}
      </Typography>
      <Alert severity={disabled ? "error" : "warning"}>
        已加载 {state.items.length}/{state.total} 条匹配来源
        <Typography>
          {disabled
            ? `当前不能继续${actionLabel}。已保留当前选择和词条状态，请稍后重试。`
            : `请核对全部匹配词条；确认后将按当前结果继续${actionLabel}。`}
        </Typography>
      </Alert>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <Typography fontWeight={600} sx={{ my: 1 }}>
            {group.title}
          </Typography>
          <Stack
            component="ul"
            sx={{ listStyle: "none", p: 0, m: 0 }}
            spacing={1}
          >
            {group.cards.map((card) => (
              <li key={card.entry_id}>
                <Stack
                  direction="row"
                  useFlexGap
                  flexWrap="wrap"
                  spacing={1}
                  alignItems="center"
                >
                  <Typography className="tsz-words" fontWeight={600}>
                    {card.label}
                  </Typography>
                  <Chip label={card.kind === "word" ? "单词" : "短语"} />
                  <Chip label={statusLabel[card.status]} />
                  <Typography color="text.secondary">
                    {card.match_count} 个来源
                  </Typography>
                </Stack>
                <Accordion
                  disableGutters
                  elevation={0}
                  slotProps={{ transition: { unmountOnExit: true } }}
                >
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    查看候选详情
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1}>
                      {card.source_labels.map((source) => (
                        <Typography
                          className="tsz-words"
                          key={source}
                          color="text.secondary"
                        >
                          {source}
                        </Typography>
                      ))}
                      {!!card.pos_labels.length && (
                        <Stack
                          direction="row"
                          useFlexGap
                          flexWrap="wrap"
                          spacing={1}
                        >
                          {card.pos_labels.map((label) => (
                            <Chip key={label} label={label} />
                          ))}
                        </Stack>
                      )}
                      {card.gloss_previews.map((gloss) => (
                        <Typography key={gloss}>释义：{gloss}</Typography>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              </li>
            ))}
          </Stack>
        </section>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {state.phase === "error" && (
          <Button onClick={state.retry}>重新加载确认快照</Button>
        )}
        {state.phase === "expired" && (
          <Button onClick={onRestart}>{`重新检查${actionLabel}条件`}</Button>
        )}
        {!disabled && (
          <Button
            variant="contained"
            loading={confirming}
            disabled={!canAcknowledgeSurfaceSnapshot(state)}
            onClick={onConfirm}
          >{`确认并${actionLabel}`}</Button>
        )}
      </Stack>
    </Paper>
  );
}
