import { QuestionCircleOutlined } from "@ant-design/icons";
import {
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tooltip
} from "antd";
import {
  SENSE_LEVEL_OPTIONS,
  SUB_POS_OPTIONS,
  toOptions
} from "../editorConstants";
import { DefinitionList } from "./DefinitionList";
import { ExampleList } from "./ExampleList";
import { RelationList } from "./RelationList";

// —— 单个「词义」的完整字段：标量属性（栅格） + 多维释义 + 多维例句 + 关联词。————————
// senseName 为该词义在 senses Form.List 中的字段名，用于拼子字段路径。
export function SenseFields({ senseName }: { senseName: number }) {
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
            rules={[{ required: true }]}
          >
            <Select
              options={toOptions(SUB_POS_OPTIONS)}
              placeholder="请选择细分词性"
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} xxl={8}>
          <Form.Item name={[senseName, "range"]} label="语义区间">
            <Input placeholder="语义区间名称" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} xxl={4}>
          <Form.Item name={[senseName, "frequency"]} label="词频">
            <InputNumber suffix="%" style={{ width: "100%" }} step={0.0001} />
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

      <DefinitionList senseName={senseName} />
      <ExampleList senseName={senseName} />
      <RelationList senseName={senseName} />
    </Card>
  );
}
