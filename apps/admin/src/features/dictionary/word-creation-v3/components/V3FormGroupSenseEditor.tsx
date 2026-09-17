import { Button, Checkbox, Empty, Flex, Tag, Typography } from "antd";
import { useState } from "react";
import type {
  WordFormGroupV3,
  WordPosFormsV3,
  WordSenseWritableV3
} from "@tsz/types";
import { definitionSummary } from "../meaningsModel";

export function V3FormGroupSenseEditor({
  pos,
  group,
  senses: allSenses,
  savedSenseIds,
  onConfirm,
  onCancel,
  onGoToMeanings,
  onRestoreGeneral
}: {
  pos: WordPosFormsV3;
  group: WordFormGroupV3;
  senses: readonly WordSenseWritableV3[];
  savedSenseIds?: ReadonlySet<string>;
  onConfirm: (senseIds: string[]) => void;
  onCancel: () => void;
  onGoToMeanings?: () => void;
  onRestoreGeneral?: () => void;
}) {
  const senses = allSenses.filter(
    (sense) =>
      savedSenseIds?.has(sense.id) ||
      Boolean(sense.form_group_id) ||
      definitionSummary(sense) !== "待填写释义"
  );
  const [selected, setSelected] = useState(() =>
    senses
      .filter((sense) => sense.form_group_id === group.id)
      .map((sense) => sense.id)
  );
  const available = senses.filter(
    (sense) =>
      (!savedSenseIds || savedSenseIds.has(sense.id)) &&
      (!sense.form_group_id || sense.form_group_id === group.id)
  );
  const validIds = selected.filter((id) =>
    available.some((sense) => sense.id === id)
  );
  const editing = group.scope === "dedicated";
  return (
    <section
      className="v3-group-sense-editor"
      aria-label={`第 ${pos.form_groups.findIndex((item) => item.id === group.id) + 1} 组适用词义编辑`}
    >
      <Flex align="center" justify="space-between" gap="small" wrap>
        <Typography.Text strong>选择适用词义</Typography.Text>
        <Typography.Text type="secondary">
          已选 {validIds.length} 项
        </Typography.Text>
      </Flex>
      <Flex vertical gap="middle">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          至少选择一个词义，可多选。仅显示当前基本词性的词义。
        </Typography.Paragraph>
        {senses.length === 0 ? (
          <Empty description="当前基本词性还没有词义，请先添加词义。">
            {onGoToMeanings ? (
              <Button type="primary" onClick={onGoToMeanings}>
                前往添加词义
              </Button>
            ) : null}
          </Empty>
        ) : (
          <Flex vertical gap="small" className="v3-group-sense-options">
            {senses.map((sense, index) => {
              const unsaved = savedSenseIds && !savedSenseIds.has(sense.id);
              const otherGroup =
                sense.form_group_id && sense.form_group_id !== group.id;
              const ownerIndex = pos.form_groups.findIndex(
                (item) => item.id === sense.form_group_id
              );
              return (
                <Checkbox
                  key={sense.id}
                  checked={validIds.includes(sense.id)}
                  disabled={Boolean(otherGroup || unsaved)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...validIds, sense.id]
                        : validIds.filter((id) => id !== sense.id)
                    )
                  }
                >
                  <span className="v3-group-sense-option">
                    <span>
                      <Tag>{sense.level}</Tag>
                      {index + 1}. {definitionSummary(sense)}
                    </span>
                    {unsaved ? (
                      <Typography.Text type="secondary">
                        尚未保存，请先保存词义
                      </Typography.Text>
                    ) : null}
                    {otherGroup ? (
                      <Typography.Text type="secondary">
                        {ownerIndex >= 0
                          ? `已绑定第 ${ownerIndex + 1} 组`
                          : "已绑定其他专用组"}
                      </Typography.Text>
                    ) : null}
                  </span>
                </Checkbox>
              );
            })}
          </Flex>
        )}
        {savedSenseIds &&
        senses.some((sense) => !savedSenseIds.has(sense.id)) &&
        onGoToMeanings ? (
          <Button type="link" onClick={onGoToMeanings}>
            前往保存词义
          </Button>
        ) : null}
        {editing && validIds.length === 0 ? (
          <Typography.Text type="warning">
            专用组至少保留一个词义，或选择“恢复适用全部词义”解除限制。
          </Typography.Text>
        ) : null}
      </Flex>
      <Flex
        className="v3-group-sense-editor-actions"
        align="center"
        justify="space-between"
        gap="small"
        wrap
      >
        {editing && onRestoreGeneral ? (
          <Button type="text" onClick={onRestoreGeneral}>
            恢复适用全部词义
          </Button>
        ) : (
          <span />
        )}
        <Flex gap="small">
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            disabled={validIds.length === 0}
            onClick={() => onConfirm(validIds)}
          >
            确认选择
          </Button>
        </Flex>
      </Flex>
    </section>
  );
}
