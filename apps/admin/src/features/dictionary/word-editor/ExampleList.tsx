import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Divider, Flex, Form, Input, Typography } from "antd";
import { defaultExample } from "./mapping";
import { VoiceActions } from "./VoiceActions";
import { SENTENCE_MAX } from "./widths";

const { Text } = Typography;

// —— 多维例句：某个词义下的例句列表(文本快照;弱引用例句模块属后续功能)。——————————————
export function ExampleList({ senseName }: { senseName: number }) {
  return (
    <>
      <Divider titlePlacement="start" style={{ margin: "16px 0 12px" }}>
        <Text strong>多维例句</Text>
      </Divider>
      <Form.List name={[senseName, "examples"]}>
        {(exs, { add, remove }) => (
          <>
            {exs.map((ex, idx) => (
              <Flex
                key={ex.key}
                gap={8}
                align="center"
                style={{ marginBottom: 8, minWidth: 0 }}
              >
                <div style={{ width: 20, color: "#888", flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <Form.Item name={[ex.name, "text"]} noStyle>
                  <Input
                    placeholder="…centre the picture on the wall."
                    style={{ flex: 1, minWidth: 0, maxWidth: SENTENCE_MAX }}
                  />
                </Form.Item>
                <Flex gap={2} align="center" style={{ flexShrink: 0 }}>
                  <VoiceActions />
                  <Button
                    type="text"
                    size="small"
                    icon={<MinusCircleOutlined />}
                    onClick={() => remove(ex.name)}
                  />
                </Flex>
              </Flex>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add(defaultExample())}
              style={{ marginInlineStart: 28 }}
            >
              增加例句
            </Button>
          </>
        )}
      </Form.List>
    </>
  );
}
