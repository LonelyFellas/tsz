import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Flex, Form, Input } from "antd";
import { SectionTitle } from "./SectionTitle";
import { FIELD_MAX } from "./widths";

// —— 语义区间：可增删的命名列表，供词义引用。—————————————————————————————————
export function SenseRangesSection() {
  return (
    <Card
      title={<SectionTitle>语义区间</SectionTitle>}
      styles={{ header: { border: "none" }, body: { paddingTop: 0 } }}
      style={{ flex: "1 1 460px" }}
    >
      <Form.List name="senseRanges">
        {(items, { add, remove }) => (
          <>
            {items.map((item, idx) => (
              <Flex
                key={item.key}
                gap={8}
                align="center"
                style={{ marginBottom: 8 }}
              >
                <div style={{ width: 24, color: "#888" }}>{idx + 1}</div>
                <Form.Item name={[item.name, "name"]} noStyle>
                  <Input
                    placeholder="词义区间名称"
                    style={{ flex: 1, minWidth: 0, maxWidth: FIELD_MAX }}
                  />
                </Form.Item>
                <Button
                  type="text"
                  icon={<MinusCircleOutlined />}
                  onClick={() => remove(item.name)}
                />
              </Flex>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add({ name: "" })}
              style={{ marginInlineStart: 32 }}
            >
              增加语义区间
            </Button>
          </>
        )}
      </Form.List>
    </Card>
  );
}
