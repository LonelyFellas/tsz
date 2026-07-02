import { Card, Checkbox, Flex, Form, Input, InputNumber, Radio } from "antd";
import type { DialectMode } from "@tsz/types";
import { DIALECT_OPTIONS } from "../editorConstants";
import { SectionTitle } from "./SectionTitle";

// —— 基础信息：单词 / 总词频 / 方言配置，同栏收拢。————————————————————————————
// headword 在创建时确定,保存接口不收它 → 只读展示,不是表单字段。
// dialectMode 由外层监听下发，用于决定是否展示「方言类型」多选。
export function BasicInfoSection({
  headword,
  dialectMode
}: {
  headword: string;
  dialectMode?: DialectMode;
}) {
  return (
    <Card
      title={<SectionTitle>基础信息</SectionTitle>}
      styles={{ header: { border: "none" }, body: { paddingTop: 0 } }}
      style={{ flex: "1 1 560px" }}
    >
      <Flex gap={16} wrap align="flex-end">
        <Form.Item label="单词" style={{ flex: "1 1 260px", marginBottom: 16 }}>
          <Input size="large" value={headword} disabled />
        </Form.Item>
        <Form.Item
          name="frequency"
          label="总词频"
          rules={[{ required: true, message: "请输入词频" }]}
          style={{ width: 200, marginBottom: 16 }}
        >
          <InputNumber
            suffix="%"
            min={0}
            max={100}
            step={0.0001}
            size="large"
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Flex>
      <Form.Item
        name="dialectMode"
        label="是否区分方言"
        rules={[{ required: true }]}
      >
        <Radio.Group>
          <Radio value="unified">无需分方言</Radio>
          <Radio value="distinguish">需区分方言</Radio>
        </Radio.Group>
      </Form.Item>
      {dialectMode === "distinguish" && (
        <Form.Item
          name="dialects"
          label="方言类型"
          rules={[{ required: true, message: "请至少选择一种方言" }]}
          style={{ marginBottom: 0 }}
        >
          <Checkbox.Group options={DIALECT_OPTIONS} />
        </Form.Item>
      )}
    </Card>
  );
}
