import {
  Alert,
  Button,
  Card,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import type { NextDetection } from "@tsz/types";
import { DictionaryDetectionCard } from "./DictionaryDetectionCard";

export function EntryBasicsSnapshot({
  headword,
  kind,
  detection,
  loading = false,
  error,
  onRetry
}: {
  headword: string;
  kind: "word" | "phrase";
  detection?: NextDetection;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
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
      {loading ? (
        <Card className="word-detection-result-card" title="内置词典">
          <Spin aria-label="正在读取内置词典" />
        </Card>
      ) : error ? (
        <Card className="word-detection-result-card" title="内置词典">
          <Alert
            type="error"
            showIcon
            title="无法读取内置词典"
            description={
              error instanceof Error ? error.message : "请求失败，请重试。"
            }
            action={onRetry && <Button onClick={onRetry}>重试</Button>}
          />
        </Card>
      ) : detection ? (
        <DictionaryDetectionCard detection={detection} />
      ) : (
        <Card className="word-detection-result-card" title="内置词典">
          <Alert
            className="lexicon-next-empty-state"
            type="info"
            title="未找到内置词典匹配"
          />
        </Card>
      )}
    </div>
  );
}
