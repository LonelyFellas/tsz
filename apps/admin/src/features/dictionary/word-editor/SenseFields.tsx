import { QuestionCircleOutlined } from "@ant-design/icons";
import {
  Card,
  Col,
  Form,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tooltip
} from "antd";
import { useMemo } from "react";
import {
  SENSE_LEVEL_OPTIONS,
  SUB_POS_OPTIONS,
  toOptions
} from "../editorConstants";
import { DefinitionList } from "./DefinitionList";
import { ExampleList } from "./ExampleList";
import type { SenseRangeRow } from "./mapping";
import { RelationList } from "./RelationList";

// —— 单个「词义」的完整字段：标量属性（栅格） + 多维释义 + 多维例句 + 关联词。————————
// posName/senseName 为该词义在嵌套 Form.List 中的字段名，用于拼子字段路径。
export function SenseFields({
  posName,
  senseName
}: {
  posName: number;
  senseName: number;
}) {
  // 语义区间下拉:引用词条级 sense_groups(存 id,显示名称)。空名占位行不进选项。
  // ⚠️ preserve 必须开:行内的 id 没有对应 Form.Item(隐藏簿记),默认 useWatch 只回
  // 已注册字段,拿不到 id 会让选项 value 变 undefined,点了也选不上。
  const senseRanges = Form.useWatch<SenseRangeRow[] | undefined>(
    "senseRanges",
    { preserve: true }
  );
  // memo:每个词义都渲染一份该下拉,别让无关字段的输入反复重建选项数组。
  const rangeOptions = useMemo(
    () =>
      (senseRanges ?? [])
        .filter((g): g is SenseRangeRow => Boolean(g && g.name?.trim()))
        .map((g) => ({ value: g.id, label: g.name })),
    [senseRanges]
  );

  return (
    <Card size="small">
      {/* 标量字段用栅格：xs 每行 1 个、sm 每行 2 个、xxl(≥1600) 一行铺 4 个，
          宽屏用「多字段填宽」代替「单字段拉宽」。 */}
      <Row gutter={16}>
        <Col xs={24} sm={12} xxl={4}>
          <Form.Item
            name={[senseName, "level"]}
            label="词义等级"
            rules={[{ required: true }]}
          >
            <Select options={toOptions(SENSE_LEVEL_OPTIONS)} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} xxl={8}>
          <Form.Item
            name={[senseName, "subPos"]}
            label="细分词性"
            rules={[{ required: true, message: "请选择细分词性" }]}
          >
            <Select options={SUB_POS_OPTIONS} placeholder="请选择细分词性" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} xxl={8}>
          <Form.Item name={[senseName, "senseGroupId"]} label="语义区间">
            <Select
              options={rangeOptions}
              placeholder="选择语义区间(可空)"
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} xxl={4}>
          <Form.Item name={[senseName, "frequency"]} label="词频">
            <InputNumber
              suffix="%"
              min={0}
              max={100}
              style={{ width: "100%" }}
              step={0.0001}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        name={[senseName, "contextDependent"]}
        label={
          <Space size={4}>
            是否依赖语境
            <Tooltip title="该词义是否依赖上下文语境判断">
              <QuestionCircleOutlined style={{ color: "#aaa" }} />
            </Tooltip>
          </Space>
        }
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>

      <DefinitionList posName={posName} senseName={senseName} />
      <ExampleList senseName={senseName} />
      <RelationList posName={posName} senseName={senseName} />
    </Card>
  );
}
