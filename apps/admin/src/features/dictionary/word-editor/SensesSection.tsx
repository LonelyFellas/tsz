import { Form, Tabs } from "antd";
import { defaultSense } from "./mapping";
import { SectionTitle } from "./SectionTitle";
import { SenseFields } from "./SenseFields";

// —— 多维词义：以可增删的 Tabs 展示多个「词义」，每个词义有独立的等级/词性/释义/例句。——
// Tabs 的 key 用 Form.List 的稳定 field.key（而非位置 name），删除中间项时不会错位；
// onEdit 删除再由 key 反查 name 交给 remove。
export function SensesSection({ posName }: { posName: number }) {
  const form = Form.useFormInstance();
  return (
    <>
      <SectionTitle>多维词义</SectionTitle>
      <Form.List name={[posName, "senses"]}>
        {(senses, { add, remove }) => (
          <Tabs
            type="editable-card"
            onEdit={(targetKey, action) => {
              if (action === "add") {
                // 交互约定(文档 §6):新建词义默认带出词条词频。
                add(defaultSense(form.getFieldValue("frequency")));
                return;
              }
              const target = senses.find((s) => String(s.key) === targetKey);
              if (target) remove(target.name);
            }}
            items={senses.map((sense, idx) => ({
              key: String(sense.key),
              label: `词义 ${idx + 1}`,
              closable: senses.length > 1,
              children: <SenseFields posName={posName} senseName={sense.name} />
            }))}
          />
        )}
      </Form.List>
    </>
  );
}
