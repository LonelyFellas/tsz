import { Card, Checkbox, Flex, Form, Input, InputNumber, Radio } from "antd";
import { DIALECTS } from "../editorConstants";
import { SectionTitle } from "./SectionTitle";

// —— 基础信息：单词 / 总词频 / 方言配置，同栏收拢。————————————————————————————
// dialectMode 由外层监听下发，用于决定是否展示「方言类型」多选。
export function BasicInfoSection({ dialectMode }: { dialectMode?: string }) {
  return (
    <Card
      title={<SectionTitle>基础信息</SectionTitle>}
      styles={{ header: { border: "none" }, body: { paddingTop: 0 } }}
      style={{ flex: "1 1 560px" }}
    >
      <Flex gap={16} wrap align="flex-end">
        <Form.Item
          name="word"
          label="单词"
          rules={[{ required: true, message: "请输入单词" }]}
          style={{ flex: "1 1 260px", marginBottom: 16 }}
        >
          <Input
            size="large"
            placeholder="请输入单词，例如 centre"
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="frequency"
          label="总词频"
          rules={[{ required: true }]}
          style={{ width: 200, marginBottom: 16 }}
        >
          <InputNumber
            suffix="%"
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
          <Radio value="none">无需分方言</Radio>
          <Radio value="split">需区分方言</Radio>
        </Radio.Group>
      </Form.Item>
      {dialectMode === "split" && (
        <Form.Item
          name="dialects"
          label="方言类型"
          rules={[{ required: true, message: "请至少选择一种方言" }]}
          style={{ marginBottom: 0 }}
        >
          <Checkbox.Group
            options={DIALECTS.map((d) => ({ label: d, value: d }))}
          />
        </Form.Item>
      )}
    </Card>
  );
}
