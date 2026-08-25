import {
  Alert,
  Button,
  Empty,
  Flex,
  Select,
  Space,
  Tabs,
  Typography
} from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  V3DraftValidationIssue
} from "@tsz/types";
import { useEffect, useMemo, useState } from "react";
import { partOfSpeechDataSource } from "../../dataSource";
import { newWordNodeId } from "../../word-model/primitives";
import {
  addPartOfSpeech,
  deletePartOfSpeech,
  type V3IdFactory
} from "../operations";
import { V3PosTab } from "./V3PosTab";
import "../v3-forms.css";

export interface V3FormsAndPronunciationStepProps {
  value: DraftFormsStepContentV3;
  onChange: (next: DraftFormsStepContentV3) => void;
  activePosId?: string;
  onActivePosChange?: (posId: string) => void;
  issues?: readonly V3DraftValidationIssue[];
  idFactory?: V3IdFactory;
}

export function V3FormsAndPronunciationStep({
  value,
  onChange,
  activePosId,
  onActivePosChange,
  issues = [],
  idFactory = newWordNodeId
}: V3FormsAndPronunciationStepProps) {
  const [catalog, setCatalog] = useState<{
    data?: PartOfSpeechCatalogResponse;
    isError: boolean;
    isPending: boolean;
  }>({ isError: false, isPending: true });
  const [pendingPosCode, setPendingPosCode] = useState<string>();
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
  const usedPosCodes = useMemo(
    () => new Set(value.pos.map((pos) => pos.pos)),
    [value.pos]
  );
  const availablePosItems = useMemo(
    () =>
      (catalog.data?.items ?? []).filter(
        (item) => !usedPosCodes.has(item.code)
      ),
    [catalog.data?.items, usedPosCodes]
  );
  const selectedPos = availablePosItems.find(
    (item) => item.code === pendingPosCode
  );

  const addPos = (item: PartOfSpeechCatalogItem) => {
    const result = addPartOfSpeech(value, item, idFactory);
    if (!result.ok) return;
    const added = result.value.pos.at(-1)!;
    onChange(result.value);
    setPendingPosCode(undefined);
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

  return (
    <Flex className="v3-forms-step" vertical gap="middle">
      {issues.length > 0 && (
        <Alert
          description={
            <ul className="v3-issue-list">
              {issues.map((issue) => (
                <li key={`${issue.node_id}:${issue.field}:${issue.code}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          }
          showIcon
          title="词形与发音尚未完成"
          type="warning"
        />
      )}
      {catalog.isError && (
        <Alert showIcon title="词性目录不可用，已停止新增结构" type="error" />
      )}
      <Space wrap>
        <Select
          aria-label="待新增词性"
          disabled={catalog.isError || catalog.isPending}
          loading={catalog.isPending}
          onChange={setPendingPosCode}
          options={availablePosItems.map((item) => ({
            value: item.code,
            label: item.name_zh
          }))}
          placeholder="选择词性"
          value={pendingPosCode}
        />
        <Button
          aria-label="新增词性"
          disabled={!selectedPos || catalog.isError || catalog.isPending}
          onClick={() => selectedPos && addPos(selectedPos)}
        >
          新增词性
        </Button>
      </Space>
      {value.pos.length === 0 ? (
        <Empty description="草稿可暂时不添加词性" />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            concrete form 均为平级实体；同一 form 可通过 membership
            在多个组中共享。
          </Typography.Paragraph>
          <Tabs
            activeKey={activePosId}
            key={value.pos.map((pos) => pos.pos_id).join(":")}
            onChange={onActivePosChange}
            items={value.pos.map((pos) => ({
              key: pos.pos_id,
              label: pos.pos,
              children: (
                <V3PosTab
                  content={value}
                  idFactory={idFactory}
                  issues={issues}
                  onChange={onChange}
                  onDeletePos={() => deletePos(pos.pos_id)}
                  pos={pos}
                  posCatalog={catalog.data?.items.find(
                    (item) => item.code === pos.pos
                  )}
                />
              )
            }))}
          />
        </>
      )}
    </Flex>
  );
}
