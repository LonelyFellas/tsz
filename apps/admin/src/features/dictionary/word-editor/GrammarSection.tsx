import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Flex, Form, Input, Typography } from "antd";
import { shownDialects } from "../editorConstants";
import { SectionTitle } from "./SectionTitle";
import { VoiceActions } from "./VoiceActions";
import { SENTENCE_MAX } from "./widths";

const { Text } = Typography;

// —— 语法结构：编号列表，每条按方言各一行例句 + 语音操作。未区分方言时用单一「默认」行。——
export function GrammarSection({
  posName,
  dialects
}: {
  posName: number;
  dialects: string[];
}) {
  const shown = shownDialects(dialects);
  return (
    <>
      <SectionTitle ai>语法结构</SectionTitle>
      <Card size="small" style={{ background: "#f5f8ff" }}>
        <Form.List name={[posName, "grammar"]}>
          {(items, { add, remove }) => (
            <>
              {items.map((item, idx) => (
                <Flex key={item.key} gap={8} style={{ marginBottom: 12 }}>
                  <div style={{ width: 24, paddingTop: 6, color: "#888" }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {shown.map((dialect) => (
                      <Flex
                        key={dialect}
                        gap={8}
                        align="center"
                        style={{ marginBottom: 6 }}
                      >
                        <Text style={{ width: 32, color: "#0071e3" }} strong>
                          {dialect}
                        </Text>
                        <Form.Item name={[item.name, dialect]} noStyle>
                          <Input
                            placeholder="请完善语法结构"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              maxWidth: SENTENCE_MAX
                            }}
                          />
                        </Form.Item>
                        <VoiceActions />
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusCircleOutlined />}
                          onClick={() => remove(item.name)}
                        />
                      </Flex>
                    ))}
                  </div>
                </Flex>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add()}
                style={{ marginInlineStart: 32 }}
              >
                增加语法结构
              </Button>
            </>
          )}
        </Form.List>
      </Card>
    </>
  );
}
