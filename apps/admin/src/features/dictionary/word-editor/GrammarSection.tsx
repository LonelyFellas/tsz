import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Flex, Form, Input, Typography } from "antd";
import type { Dialect } from "@tsz/types";
import { DIALECT_LABEL, shownDialects } from "../editorConstants";
import { defaultGrammarRow } from "./mapping";
import { SectionTitle } from "./SectionTitle";
import { VoiceActions } from "./VoiceActions";
import { SENTENCE_MAX } from "./widths";

const { Text } = Typography;

// —— 语法结构：编号列表，每条按方言各一行措辞 + 语音操作。未区分方言时用单一 common 行。——
// 措辞文本存于 [row, "texts", dialect];variantIds/variantRich 是隐藏簿记,保存时用。
export function GrammarSection({
  posName,
  dialects
}: {
  posName: number;
  dialects: Dialect[];
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
                          {DIALECT_LABEL[dialect]}
                        </Text>
                        <Form.Item name={[item.name, "texts", dialect]} noStyle>
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
                onClick={() => add(defaultGrammarRow())}
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
