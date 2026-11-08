import { useLexiconListTranslation } from "@/features/dictionary/i18n/list";
import { useFormTypeLabel } from "./part-of-speech/FormTypeLabels";
import {
  Alert,
  Button,
  Card,
  Collapse,
  List,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
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
  action?: "restore" | "restoreDraft" | "publish";
}) {
  const { t } = useLexiconListTranslation();
  const formTypeLabel = useFormTypeLabel();
  const cards = aggregateLifecycleSurfaceMatchCards(state, formTypeLabel);
  const groups = [
    ["visibility", t("visibility_only")],
    ["ordinary", t("homograph_only")],
    ["composite", t("visibility_homograph")]
  ]
    .map(([key, title]) => ({
      key,
      title,
      cards: cards.filter((card) => card.membership === key)
    }))
    .filter((group) => group.cards.length > 0);
  const disabled = state.phase === "disabled";
  const actionLabel =
    action === "publish"
      ? t("publish")
      : action === "restoreDraft"
        ? t("restore_draft")
        : t("restore");
  const statusLabel = {
    draft: t("status_draft"),
    published: t("status_published"),
    archived: t("status_archived")
  } as const;
  return (
    <Card
      size="small"
      title={
        disabled
          ? t("public_homonyms_disabled")
          : t("confirmation_title", {
              action: actionLabel,
              scope:
                action === "restoreDraft" || action === "restore"
                  ? t("entry")
                  : t("public_scope")
            })
      }
    >
      <Alert
        showIcon
        type={disabled ? "error" : "warning"}
        title={t("matches_loaded", {
          loaded: state.items.length,
          total: state.total
        })}
        description={
          disabled
            ? t("confirmation_disabled", { action: actionLabel })
            : t("confirmation_help", { action: actionLabel })
        }
      />
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <Typography.Text strong>{group.title}</Typography.Text>
          <List
            size="small"
            dataSource={group.cards}
            renderItem={(card) => (
              <List.Item>
                <Space wrap>
                  <Typography.Text className="tsz-words" strong>
                    {card.label}
                  </Typography.Text>
                  <Tag>
                    {card.kind === "word" ? t("kind_word") : t("kind_phrase")}
                  </Tag>
                  <Tag>{statusLabel[card.status]}</Tag>
                  <Typography.Text type="secondary">
                    {t("source_count", { count: card.match_count })}
                  </Typography.Text>
                </Space>
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "details",
                      label: t("candidate_details"),
                      children: (
                        <Space orientation="vertical" size="small">
                          {card.source_labels.map((source) => (
                            <Typography.Text
                              className="tsz-words"
                              key={source}
                              type="secondary"
                            >
                              {source}
                            </Typography.Text>
                          ))}
                          {card.pos_labels.length > 0 ? (
                            <Space wrap>
                              {card.pos_labels.map((label) => (
                                <Tag key={label}>{label}</Tag>
                              ))}
                            </Space>
                          ) : null}
                          {card.gloss_previews.map((gloss) => (
                            <Typography.Text key={gloss}>
                              {t("gloss_prefix")}
                              {gloss}
                            </Typography.Text>
                          ))}
                        </Space>
                      )
                    }
                  ]}
                />
              </List.Item>
            )}
          />
        </section>
      ))}
      <Space>
        {state.phase === "error" ? (
          <Button onClick={state.retry}>{t("reload_snapshot")}</Button>
        ) : null}
        {state.phase === "expired" ? (
          <Button onClick={onRestart}>
            {t("recheck_action", { action: actionLabel })}
          </Button>
        ) : null}
        {!disabled && (
          <Button
            type="primary"
            loading={confirming}
            disabled={!canAcknowledgeSurfaceSnapshot(state)}
            onClick={onConfirm}
          >
            {t("confirm_action", { action: actionLabel })}
          </Button>
        )}
      </Space>
    </Card>
  );
}
