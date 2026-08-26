import {
  Alert,
  Button,
  Card,
  Collapse,
  List,
  Space,
  Tag,
  Typography
} from "antd";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "./surfaceSnapshot";
import type { SurfaceMatchPageAny } from "@tsz/types";

export function LifecycleSurfaceConfirmation({
  state,
  onConfirm,
  onRestart,
  confirming,
  action = "restore"
}: {
  state: SurfaceSnapshotState<SurfaceMatchPageAny> & { retry: () => void };
  onConfirm: () => void;
  onRestart: () => void;
  confirming: boolean;
  action?: "restore" | "activate";
}) {
  const cards = aggregateLifecycleSurfaceMatchCards(state);
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
  const isActivation = action === "activate";
  const statusLabel = {
    draft: "草稿",
    published: "已发布",
    archived: "已归档"
  } as const;
  return (
    <Card
      size="small"
      title={
        disabled
          ? "学习端暂不支持多个同名公开词条"
          : isActivation
            ? "激活前需要确认同名公开范围"
            : "恢复前需要确认同名公开范围"
      }
    >
      <Alert
        showIcon
        type={disabled ? "error" : "warning"}
        title={`已加载 ${state.items.length}/${state.total} 条匹配来源`}
        description={
          disabled
            ? `当前不能继续${isActivation ? "激活" : "恢复"}。已保留当前选择和词条状态，请稍后重试。`
            : `请核对全部匹配词条；确认后将按当前结果继续${isActivation ? "激活" : "恢复"}。`
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
                  <Typography.Text strong>{card.label}</Typography.Text>
                  <Tag>{card.kind === "word" ? "单词" : "短语"}</Tag>
                  <Tag>{statusLabel[card.status]}</Tag>
                  <Typography.Text type="secondary">
                    {card.match_count} 个来源
                  </Typography.Text>
                </Space>
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "details",
                      label: "查看候选详情",
                      children: (
                        <Space orientation="vertical" size="small">
                          {card.source_labels.map((source) => (
                            <Typography.Text key={source} type="secondary">
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
                              释义：{gloss}
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
          <Button onClick={state.retry}>重新加载确认快照</Button>
        ) : null}
        {state.phase === "expired" ? (
          <Button onClick={onRestart}>
            {isActivation ? "重新检查激活条件" : "重新检查恢复条件"}
          </Button>
        ) : null}
        {!disabled && (
          <Button
            type="primary"
            loading={confirming}
            disabled={!canAcknowledgeSurfaceSnapshot(state)}
            onClick={onConfirm}
          >
            {isActivation ? "确认并激活" : "确认并恢复"}
          </Button>
        )}
      </Space>
    </Card>
  );
}
