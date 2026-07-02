import { App, Breadcrumb, Card, Flex, Form } from "antd";
import { useNavigate } from "react-router-dom";
import { BasicInfoSection } from "./word-editor/BasicInfoSection";
import { defaultPos } from "./word-editor/defaults";
import { EditorFooter } from "./word-editor/EditorFooter";
import { PosTabsSection } from "./word-editor/PosTabsSection";
import { SectionTitle } from "./word-editor/SectionTitle";
import { SenseRangesSection } from "./word-editor/SenseRangesSection";

// 创建单词整页富表单的组合根：持有 form、监听方言配置、编排各分区。
// 具体分区拆到 ./word-editor/* 下，便于单独维护与复用。
export function WordEditor() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const dialectMode = Form.useWatch("dialectMode", form);
  const dialects: string[] = Form.useWatch("dialects", form) ?? [];
  // 仅在「需区分方言」时按所选方言渲染词形/语法分块；否则用单一「默认」块。
  const activeDialects = dialectMode === "split" ? dialects : [];

  const submit = () =>
    form
      .validateFields()
      .then(() => message.success("提交成功（Mock）"))
      .catch(() => message.warning("请完善必填项"));

  return (
    // 满宽填满内容区（与列表页一致），不设上限——超宽屏也不留两侧空白。
    // 单词等易过宽的字段各自设了 maxWidth，不会因满宽被拉伸失衡。
    <div style={{ paddingBottom: 72 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: "词库管理" },
          { title: <a onClick={() => navigate("/words")}>智能词库</a> },
          { title: "创建单词" }
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dialectMode: "split",
          dialects: ["英式", "美式"],
          frequency: 0.023134,
          senseRanges: [{ name: "" }],
          posList: [defaultPos("动词")]
        }}
      >
        <Flex gap={16} wrap align="stretch" style={{ marginBottom: 16 }}>
          <BasicInfoSection dialectMode={dialectMode} />
          <SenseRangesSection />
        </Flex>

        <Card
          title={<SectionTitle ai>基本词性</SectionTitle>}
          styles={{ header: { border: "none" }, body: { paddingTop: 0 } }}
        >
          <PosTabsSection form={form} activeDialects={activeDialects} />
        </Card>
      </Form>

      <EditorFooter
        onSaveDraft={() => message.success("已保存草稿（Mock）")}
        onGenerateVoice={() => message.info("生成语音（Mock）")}
        onSubmit={submit}
      />
    </div>
  );
}
