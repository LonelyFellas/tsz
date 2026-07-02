import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Typography
} from "antd";
import { RELATION_GROUPS } from "../editorConstants";
import { FIELD_MAX, RELATION_WORD_MAX } from "./widths";

const { Text } = Typography;

// —— 关联词：近义词 / 反义词 / 派生词三组，各是一个「度量 + 单词 + 中文释义」列表。——
export function RelationList({ senseName }: { senseName: number }) {
  return (
    <>
      <Divider titlePlacement="start" style={{ margin: "16px 0 12px" }}>
        <Text strong>关联词</Text>
      </Divider>
      {RELATION_GROUPS.map((group) => (
        <div key={group.key} style={{ marginBottom: 16 }}>
          <Text strong>{group.title}</Text>
          <Form.List name={[senseName, group.key]}>
            {(items, { add, remove }) => (
              <div style={{ marginTop: 8 }}>
                {items.map((item, idx) => (
                  <Flex
                    key={item.key}
                    gap={8}
                    align="center"
                    wrap
                    style={{ marginBottom: 8, minWidth: 0 }}
                  >
                    <div style={{ width: 20, color: "#888", flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    <Text
                      type="secondary"
                      style={{ width: 52, fontSize: 12, flexShrink: 0 }}
                    >
                      {group.metric}
                    </Text>
                    <Form.Item name={[item.name, "score"]} noStyle>
                      <InputNumber
                        suffix="%"
                        min={0}
                        max={100}
                        style={{ width: 90 }}
                      />
                    </Form.Item>
                    <Form.Item name={[item.name, "word"]} noStyle>
                      <Input
                        placeholder="关联单词"
                        style={{
                          flex: "1 1 130px",
                          minWidth: 0,
                          maxWidth: RELATION_WORD_MAX
                        }}
                      />
                    </Form.Item>
                    <Form.Item name={[item.name, "meaning"]} noStyle>
                      <Input
                        placeholder="中文释义"
                        style={{
                          flex: "1 1 130px",
                          minWidth: 0,
                          maxWidth: FIELD_MAX
                        }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      size="small"
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(item.name)}
                      style={{ flexShrink: 0 }}
                    />
                  </Flex>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => add({})}
                >
                  增加{group.title}
                </Button>
              </div>
            )}
          </Form.List>
        </div>
      ))}
    </>
  );
}
