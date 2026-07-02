import { Form, Tabs } from "antd";
import type { FormInstance } from "antd";
import { memo } from "react";
import type { Dialect, WordPosTag } from "@tsz/types";
import { POS_TAG_KEYS, POS_TAG_ZH } from "../editorConstants";
import { GrammarSection } from "./GrammarSection";
import { InflectionSection } from "./InflectionSection";
import { defaultPos } from "./mapping";
import { SensesSection } from "./SensesSection";

// 单个词性 Tab 的内容。memo:嵌套 Form.List 下任意字段输入都会重跑外层
// render prop,memo 让 props 未变的 Tab 面板跳过深层重渲染
// (面板内各控件仍由 rc-field-form 的字段订阅精准更新,不受影响)。
const PosTabPane = memo(function PosTabPane({
  posName,
  dialects
}: {
  posName: number;
  dialects: Dialect[];
}) {
  return (
    <div>
      <InflectionSection posName={posName} dialects={dialects} />
      <GrammarSection posName={posName} dialects={dialects} />
      <SensesSection posName={posName} />
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
  return (
    <Form.List name="posList">
      {(posTabs, { add, remove }) => (
        <Tabs
          type="editable-card"
          onEdit={(targetKey, action) => {
            if (action === "add") {
              const used = new Set(
                (form.getFieldValue("posList") ?? []).map(
                  (p: { pos: WordPosTag }) => p?.pos
                )
              );
              const next = POS_TAG_KEYS.find((p) => !used.has(p)) ?? "noun";
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
              label: pos ? POS_TAG_ZH[pos] : "词性",
              closable: posTabs.length > 1,
              children: (
                <PosTabPane posName={tab.name} dialects={activeDialects} />
              )
            };
          })}
        />
      )}
    </Form.List>
  );
}
