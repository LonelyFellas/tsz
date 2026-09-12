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
  reorderPos,
  type V3IdFactory,
  type V3StableVariantIdFactory
} from "../operations";
import { V3PosTab } from "./V3PosTab";
import { V3AddBasicPosSelect } from "./V3AddBasicPosSelect";
import { partOfSpeechLabel } from "../presentation";
import { useFormDisplayState } from "../formDisplayState";
import { countV3PosFormIncomplete } from "../posCompletion";
import {
  PronunciationPreviewProvider,
  usePronunciationVoiceNotice
} from "../../word-creation/PronunciationPreview";
import "../v3-forms.css";
import "../posTabs.css";
import { sortableRowClass, useSortableRows } from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";

/** 只接受本编辑器发出的词性拖动，避免把外部拖入的内容当成排序。 */
const POS_DRAG_TYPE = "application/x-tsz-v3-pos";

export interface V3FormsAndPronunciationStepProps {
  value: DraftFormsStepContentV3;
  onChange: (next: DraftFormsStepContentV3) => void;
  /** 词条是单词还是短语；决定「添加基本词性」只列哪一侧。 */
  entryKind?: WordEntryKindV3;
  activePosId?: string;
  onActivePosChange?: (posId: string) => void;
  issues?: readonly V3DraftValidationIssue[];
  idFactory?: V3IdFactory;
  stableVariantIds?: V3StableVariantIdFactory;
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
  entryKind,
  activePosId,
  onActivePosChange,
  issues = [],
  idFactory = newWordNodeId,
  stableVariantIds
}: V3FormsAndPronunciationStepProps) {
  const { modal } = App.useApp();
  const displayState = useFormDisplayState();
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
      entryKind={entryKind}
      forms={value}
      isError={catalog.isError}
      isPending={catalog.isPending}
      onAdd={addPos}
    />
  );

  // 词性标签拖动排序，与词义步的语义区间／释义／例句共用同一套拖放内核。
  // 事件挂在自己渲染的 label 容器上，不走 Tabs 的 renderTabBar——那要依赖 rc-tabs 的内部
  // render prop 约定，antd 小版本一动就可能静默失效。
  const posSorting = useSortableRows({
    items: value.pos,
    scopeId: "v3-pos-tabs",
    dragType: POS_DRAG_TYPE,
    onChange: (next) =>
      onChange(
        reorderPos(
          value,
          next.map((pos) => pos.pos_id)
        )
      )
  });

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
                    </Space>
                  }
                />
              </div>
            )
          }
        ]
      : value.pos.map((pos, posIndex) => {
          const label =
            catalog.data?.items.find((item) => item.code === pos.pos)
              ?.name_zh ?? partOfSpeechLabel(pos.pos);
          return {
            key: pos.pos_id,
            label: (
              <span
                className={sortableRowClass(
                  "word-pos-tab-handle",
                  posSorting,
                  posIndex
                )}
                data-pos-id={pos.pos_id}
                onDragLeave={posSorting.handleDragLeave}
                onDragOver={(event) =>
                  posSorting.handleDragOver(event, posIndex)
                }
                onDrop={(event) => posSorting.handleDrop(event, posIndex)}
              >
                <Space size={6}>
                  <SortableDragHandle
                    dragImageSelector=".word-pos-tab-handle"
                    index={posIndex}
                    label={`拖动${label}`}
                    singleItemTitle="至少需要两个基本词性"
                    sorting={posSorting}
                  />
                  <strong>{label}</strong>
                  <Badge
                    count={countV3PosFormIncomplete(
                      pos,
                      catalog.data?.items.find((item) => item.code === pos.pos)
                        ?.allowed_form_types,
                      displayState?.removedFormTypes
                    )}
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
              </span>
            ),
            children: (
              <V3PosTab
                content={value}
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
            description="已按最近一次校验结果标出对应字段；修改后重新完成本步或重新检查发布条件以更新状态。"
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
