import { Alert, Button, Card, List, Space, Typography } from "antd";
import { useMemo } from "react";
import {
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "./surfaceSnapshot";

export function LifecycleSurfaceConfirmation({
  state,
  onConfirm,
  onRestart,
  confirming
}: {
  state: SurfaceSnapshotState & { retry: () => void };
  onConfirm: () => void;
  onRestart: () => void;
  confirming: boolean;
}) {
  const groups = useMemo(() => {
    const cards = aggregateSurfaceMatchCards(
      state.items,
      state.matched_entry_contexts
    );
    return [
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
  }, [state.items, state.matched_entry_contexts]);
  const disabled = state.phase === "disabled";
  return (
    <Card
      size="small"
      title={
        disabled
          ? "学习端暂不支持多个同名公开词条"
          : "恢复前需要确认同名公开范围"
      }
    >
      <Alert
        showIcon
        type={disabled ? "error" : "warning"}
        title={`已加载 ${state.items.length}/${state.total} 条匹配来源`}
        description={
          disabled
            ? "能力 gate 当前关闭，普通创建或词形确认不能替代恢复命令确认。选择与词条状态均已保留。"
            : "确认绑定本次恢复命令、完整选择、生命周期版本、策略 epoch 和完整匹配集合。"
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
                  <Typography.Text strong>
                    {card.existing.headword}
                  </Typography.Text>
                  <Typography.Text code>
                    {card.existing.word_id.slice(-8)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {card.matches.length} 个来源
                  </Typography.Text>
                </Space>
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
          <Button onClick={onRestart}>重新检查恢复条件</Button>
        ) : null}
        {!disabled && (
          <Button
            type="primary"
            loading={confirming}
            disabled={!canAcknowledgeSurfaceSnapshot(state)}
            onClick={onConfirm}
          >
            确认并恢复
          </Button>
        )}
      </Space>
    </Card>
  );
}
