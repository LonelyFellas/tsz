import { Alert, Form, Tabs } from "antd";
import type { FormInstance } from "antd";
import { memo, useMemo } from "react";
import type { Dialect, WordPosTag } from "@tsz/types";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { GrammarSection } from "./GrammarSection";
import { InflectionSection } from "./InflectionSection";
import { defaultPos } from "./mapping";
import { SensesSection } from "./SensesSection";

// 单个词性 Tab 的内容。memo:嵌套 Form.List 下任意字段输入都会重跑外层
// render prop,memo 让 props 未变的 Tab 面板跳过深层重渲染
// (面板内各控件仍由 rc-field-form 的字段订阅精准更新,不受影响)。
const PosTabPane = memo(function PosTabPane({
  posName,
  dialects,
  partOfSpeechLookup,
  catalogUnavailable
}: {
  posName: number;
  dialects: Dialect[];
  partOfSpeechLookup: PartOfSpeechLookup;
  catalogUnavailable: boolean;
}) {
  return (
    <div>
      <InflectionSection posName={posName} dialects={dialects} />
      <GrammarSection posName={posName} dialects={dialects} />
      <SensesSection
        posName={posName}
        partOfSpeechLookup={partOfSpeechLookup}
        catalogUnavailable={catalogUnavailable}
      />
    </div>
  );
});

// —— 基本词性：可增删的 Tabs，每个词性一套词形变化/语法结构/多维词义。————————————————
// 新增时选一个尚未使用的词性；Tabs key 用稳定 field.key，删除中间项不错位。
export function PosTabsSection({
  form,
  activeDialects
}: {
  form: FormInstance;
  activeDialects: Dialect[];
}) {
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  return (
    <>
      {partOfSpeechCatalog.isError && (
        <Alert
          type="warning"
          showIcon
          title="词性配置加载失败，暂时无法添加词性或选择细分词性"
          style={{ marginBottom: 16 }}
        />
      )}
      <Form.List name="posList">
        {(posTabs, { add, remove }) => (
          <Tabs
            hideAdd={
              partOfSpeechCatalog.isPending || partOfSpeechCatalog.isError
            }
            type="editable-card"
            onEdit={(targetKey, action) => {
              if (action === "add") {
                const used = new Set(
                  (form.getFieldValue("posList") ?? []).map(
                    (p: { pos: WordPosTag }) => p?.pos
                  )
                );
                const next = partOfSpeechLookup.items.find(
                  (item) => !used.has(item.code)
                )?.code;
                if (!next) return;
                // 交互约定(文档 §6):新建词义默认带出词条词频,新 Tab 的首个词义同理。
                add(defaultPos(next, form.getFieldValue("frequency")));
                return;
              }
              const target = posTabs.find((t) => String(t.key) === targetKey);
              if (target) remove(target.name);
            }}
            items={posTabs.map((tab) => {
              const pos = form.getFieldValue(["posList", tab.name, "pos"]) as
                WordPosTag | undefined;
              return {
                key: String(tab.key),
                label: pos
                  ? partOfSpeechLabel(partOfSpeechLookup, pos)
                  : "词性",
                closable: posTabs.length > 1,
                children: (
                  <PosTabPane
                    posName={tab.name}
                    dialects={activeDialects}
                    partOfSpeechLookup={partOfSpeechLookup}
                    catalogUnavailable={partOfSpeechCatalog.isError}
                  />
                )
              };
            })}
          />
        )}
      </Form.List>
    </>
  );
}
