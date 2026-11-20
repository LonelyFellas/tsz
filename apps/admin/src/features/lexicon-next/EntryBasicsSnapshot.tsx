import { Alert, Card, Tag, Typography } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import type { NextDetection } from "@tsz/types";
import { DictionaryDetectionCard } from "./DictionaryDetectionCard";

export function EntryBasicsSnapshot({
  headword,
  kind,
  detection
}: {
  headword: string;
  kind: "word" | "phrase";
  detection?: NextDetection;
}) {
  return (
    <div className="lexicon-next word-basics-workflow is-detected">
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <Typography.Title level={2}>创建词条</Typography.Title>
      </div>
      <Card
        className="word-basics-input-card"
        size="small"
        title="录入与检测"
        extra={<Tag color="blue">{kind === "word" ? "单词" : "短语"}</Tag>}
      >
        <Form layout="vertical">
          <Form.Item label="词条文本">
            <Input
              aria-label="词条文本"
              className="tsz-words"
              value={detection?.surface ?? headword}
              readOnly
              size="large"
            />
          </Form.Item>
        </Form>
      </Card>
      {detection ? (
        <DictionaryDetectionCard detection={detection} />
      ) : (
        <Alert
          type="info"
          showIcon
          title="该词条没有保存创建时的内置词典快照。"
          description="当前版本只能展示词条原始文本，无法还原创建时的词典结果。"
        />
      )}
    </div>
  );
}
