import { MinusCircleOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Badge,
  Button,
  Empty,
  Flex,
  Space,
  Tabs,
  Typography
} from "antd";
import type {
  Dialect,
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  V3DraftValidationIssue,
  WordEntryKindV3
} from "@tsz/types";
import { useEffect, useState } from "react";
import { partOfSpeechDataSource } from "../../dataSource";
import { newWordNodeId } from "../../word-model/primitives";
import {
  addPartOfSpeech,
  deletePartOfSpeech,
  type V3IdFactory,
  type V3StableVariantIdFactory
} from "../operations";
import { V3PosTab } from "./V3PosTab";
import { V3AddBasicPosSelect } from "./V3AddBasicPosSelect";
import { partOfSpeechLabel } from "../presentation";
import { v3IssueMessage } from "../presentationErrors";
import { countV3PosFormIncomplete } from "../posCompletion";
import {
  PronunciationPreviewProvider,
  usePronunciationVoiceNotice
} from "../../word-creation/PronunciationPreview";
import "../v3-forms.css";

export interface V3FormsAndPronunciationStepProps {
  value: DraftFormsStepContentV3;
  onChange: (next: DraftFormsStepContentV3) => void;
  activePosId?: string;
  onActivePosChange?: (posId: string) => void;
  issues?: readonly V3DraftValidationIssue[];
  idFactory?: V3IdFactory;
  stableVariantIds?: V3StableVariantIdFactory;
  entryKind?: WordEntryKindV3;
  sentenceTargetDiscoveryEnabled?: boolean;
}

function V3VoiceNotice({ value }: { value: DraftFormsStepContentV3 }) {
  const dialects = Array.from(
    new Set<Dialect>(
      value.pos.flatMap((pos) =>
        pos.forms.flatMap((form) =>
          form.regional_variants.mode === "common"
            ? [form.regional_variants.common.dialect]
            : [
                form.regional_variants.uk.dialect,
                form.regional_variants.us.dialect
              ]
        )
      )
    )
  );
  const notice = usePronunciationVoiceNotice(dialects);
  return notice ? (
    <Alert
      description="音标与实际发音仍可正常填写和保存；试听语音需要平台先配置对应方言的发音人。"
      showIcon
      title={notice}
      type="warning"
    />
  ) : null;
}

export function V3FormsAndPronunciationStep({
  value,
  onChange,
  activePosId,
  onActivePosChange,
  issues = [],
  idFactory = newWordNodeId,
  stableVariantIds,
  entryKind = "word",
  sentenceTargetDiscoveryEnabled = true
}: V3FormsAndPronunciationStepProps) {
  const { modal } = App.useApp();
  const [catalog, setCatalog] = useState<{
    data?: PartOfSpeechCatalogResponse;
    isError: boolean;
    isPending: boolean;
  }>({ isError: false, isPending: true });
  useEffect(() => {
    let cancelled = false;
    void partOfSpeechDataSource
      .catalog()
      .then((data) => {
        if (!cancelled) setCatalog({ data, isError: false, isPending: false });
      })
      .catch(() => {
        if (!cancelled) setCatalog({ isError: true, isPending: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const addPos = (item: PartOfSpeechCatalogItem) => {
    const result = addPartOfSpeech(value, item, idFactory);
    if (!result.ok) return;
    const added = result.value.pos.at(-1)!;
    onChange(result.value);
    onActivePosChange?.(added.pos_id);
  };

  const deletePos = (posId: string) => {
    const index = value.pos.findIndex((pos) => pos.pos_id === posId);
    const result = deletePartOfSpeech(value, posId);
    if (!result.ok) return;
    onChange(result.value);
    if (activePosId === posId) {
      const next =
        result.value.pos[Math.min(index, result.value.pos.length - 1)];
      if (next) onActivePosChange?.(next.pos_id);
    }
  };

  const addPosSelect = (
    <V3AddBasicPosSelect
      catalog={catalog.data}
      forms={value}
      isError={catalog.isError}
      isPending={catalog.isPending}
      onAdd={addPos}
    />
  );

  const tabItems =
    value.pos.length === 0
      ? [
          {
            key: "empty",
            label: "词性",
            disabled: true,
            children: (
              <div className="word-forms-tabs-empty">
                <Empty
                  className="word-forms-tabs-empty-content"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space orientation="vertical" size={4}>
                      <Typography.Text strong>暂无词性</Typography.Text>
                      <Typography.Text type="secondary">
                        草稿可暂时不添加词性
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        请从右上角添加词性。
                      </Typography.Text>
                      {issues.find((issue) => issue.code === "pos_required") ? (
                        <Typography.Text
                          className="word-field-help"
                          type="danger"
                        >
                          {v3IssueMessage(
                            issues.find(
                              (issue) => issue.code === "pos_required"
                            )!
                          )}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  }
                />
              </div>
            )
          }
        ]
      : value.pos.map((pos) => {
          const label =
            catalog.data?.items.find((item) => item.code === pos.pos)
              ?.name_zh ?? partOfSpeechLabel(pos.pos);
          return {
            key: pos.pos_id,
            label: (
              <Space size={6}>
                <strong>{label}</strong>
                <Badge
                  count={countV3PosFormIncomplete(pos)}
                  size="small"
                  title="该词性未填项"
                />
                {value.pos.length > 1 ? (
                  <Button
                    aria-label={`删除${label}`}
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      modal.confirm({
                        title: `删除词性“${label}”？`,
                        content:
                          "保存时会同时预览该词性下游词义、例句和关系的影响。",
                        okText: "删除",
                        okButtonProps: { danger: true },
                        onOk: () => deletePos(pos.pos_id)
                      });
                    }}
                    size="small"
                    type="text"
                  />
                ) : null}
              </Space>
            ),
            children: (
              <V3PosTab
                content={value}
                entryKind={entryKind}
                sentenceTargetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
                idFactory={idFactory}
                issues={issues}
                onChange={onChange}
                pos={pos}
                stableVariantIds={stableVariantIds}
                posCatalog={catalog.data?.items.find(
                  (item) => item.code === pos.pos
                )}
              />
            )
          };
        });

  return (
    <PronunciationPreviewProvider>
      <Flex className="v3-forms-step" vertical gap="middle">
        <div className="word-step-heading">
          <span className="word-step-number">STEP 02</span>
          <Typography.Title level={2} style={{ margin: 0 }}>
            词形与发音
          </Typography.Title>
          <Typography.Paragraph className="word-step-description">
            先添加基本词性，再录入各种词形。录入词形时，不要遗漏 1)
            英式或美式、2)
            规则变化或不规则变化。录入字典音标获取音频，录入实际发音时需严格按照
            “天生之®通用英语音标字母表” 进行操作。
          </Typography.Paragraph>
        </div>
        <V3VoiceNotice value={value} />
        {issues.length > 0 && (
          <Alert
            description="已按最近一次发布检查结果标出对应字段；修改后请重新检查以更新状态。"
            showIcon
            title="词形与发音尚未完成"
            type="warning"
          />
        )}
        {catalog.isError && (
          <Alert showIcon title="词性目录不可用，已停止新增结构" type="error" />
        )}
        <Tabs
          activeKey={value.pos.length === 0 ? "empty" : activePosId}
          className="word-pos-tabs word-forms-tabs"
          key={value.pos.map((pos) => pos.pos_id).join(":")}
          onChange={onActivePosChange}
          items={tabItems}
          tabBarExtraContent={addPosSelect}
        />
      </Flex>
    </PronunciationPreviewProvider>
  );
}
