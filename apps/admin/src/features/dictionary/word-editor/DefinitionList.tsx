import {
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined
} from "@ant-design/icons";
import { Button, Divider, Flex, Form, Input, Select, Typography } from "antd";
import {
  MEANING_TYPE_OPTIONS,
  SENSE_LEVEL_OPTIONS,
  toOptions
} from "../editorConstants";
import { defaultDefinition } from "./defaults";
import { VoiceActions } from "./VoiceActions";
import { FIELD_MAX, SENTENCE_MAX } from "./widths";

const { Text } = Typography;

// —— 多维释义：某个词义下的释义列表。每条 = 等级 + 释义类型 + 释义文本 + 关联语法结构。——
export function DefinitionList({ senseName }: { senseName: number }) {
  return (
    <>
      <Divider titlePlacement="start" style={{ margin: "8px 0 12px" }}>
        <Text strong>多维释义</Text>
      </Divider>
      <Form.List name={[senseName, "definitions"]}>
        {(defs, { add, remove }) => (
          <>
            {defs.map((def, idx) => (
              <Flex
                key={def.key}
                gap={8}
                align="start"
                style={{ marginBottom: 10, minWidth: 0 }}
              >
                <div style={{ width: 20, paddingTop: 6, color: "#888" }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Flex gap={8} align="center" wrap>
                    <Form.Item name={[def.name, "level"]} noStyle>
                      <Select
                        options={toOptions(SENSE_LEVEL_OPTIONS)}
                        style={{ width: 80 }}
                      />
                    </Form.Item>
                    <Form.Item name={[def.name, "type"]} noStyle>
                      <Select
                        options={toOptions(MEANING_TYPE_OPTIONS)}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item name={[def.name, "text"]} noStyle>
                      <Input
                        placeholder="请输入释义"
                        style={{
                          flex: "1 1 180px",
                          minWidth: 0,
                          maxWidth: FIELD_MAX
                        }}
                      />
                    </Form.Item>
                    <Flex gap={2} align="center">
                      <VoiceActions />
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusCircleOutlined />}
                        onClick={() => add(defaultDefinition(), idx + 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(def.name)}
                      />
                    </Flex>
                  </Flex>
                  <Flex
                    gap={8}
                    align="center"
                    style={{ marginTop: 6, minWidth: 0 }}
                  >
                    <Text
                      type="secondary"
                      style={{ width: 64, fontSize: 12, flexShrink: 0 }}
                    >
                      语法结构
                    </Text>
                    <Form.Item name={[def.name, "grammar"]} noStyle>
                      <Select
                        placeholder="This is an English sentence."
                        options={[]}
                        allowClear
                        style={{ flex: 1, minWidth: 0, maxWidth: SENTENCE_MAX }}
                      />
                    </Form.Item>
                  </Flex>
                </div>
              </Flex>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add(defaultDefinition())}
              style={{ marginInlineStart: 28 }}
            >
              增加释义
            </Button>
          </>
        )}
      </Form.List>
    </>
  );
}
