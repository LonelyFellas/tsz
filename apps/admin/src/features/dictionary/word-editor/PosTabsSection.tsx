import { Form, Tabs } from "antd";
import type { FormInstance } from "antd";
import { BASE_POS_OPTIONS } from "../editorConstants";
import { defaultPos } from "./defaults";
import { GrammarSection } from "./GrammarSection";
import { InflectionSection } from "./InflectionSection";
import { SensesSection } from "./SensesSection";

// —— 基本词性：可增删的 Tabs，每个词性一套词形变化/语法结构/多维词义。————————————————
// 新增时选一个尚未使用的词性；Tabs key 用稳定 field.key，删除中间项不错位。
export function PosTabsSection({
  form,
  activeDialects
}: {
  form: FormInstance;
  activeDialects: string[];
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
                  (p: { pos: string }) => p?.pos
                )
              );
              const next = BASE_POS_OPTIONS.find((p) => !used.has(p)) ?? "名词";
              add(defaultPos(next));
              return;
            }
            const target = posTabs.find((t) => String(t.key) === targetKey);
            if (target) remove(target.name);
          }}
          items={posTabs.map((tab) => ({
            key: String(tab.key),
            label: form.getFieldValue(["posList", tab.name, "pos"]) ?? "词性",
            closable: posTabs.length > 1,
            children: (
              <div>
                <InflectionSection
                  posName={tab.name}
                  dialects={activeDialects}
                />
                <GrammarSection posName={tab.name} dialects={activeDialects} />
                <SensesSection posName={tab.name} />
              </div>
            )
          }))}
        />
      )}
    </Form.List>
  );
}
