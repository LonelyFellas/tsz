import { Alert, Descriptions, Drawer, Space, Tag, Typography } from "antd";
import type { QuestionCandidate } from "@tsz/types";

export function PublishedSource({
  candidate,
  current,
  onClose
}: {
  candidate: QuestionCandidate | null;
  current: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="题目引用的发布词义"
      open={candidate !== null}
      onClose={onClose}
      size={560}
    >
      {candidate && (
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title
              level={2}
              className="tsz-words"
              style={{ margin: 0 }}
            >
              {candidate.spelling}
            </Typography.Title>
            <Typography.Paragraph>
              {candidate.part_of_speech} · {candidate.definition}
            </Typography.Paragraph>
            <Space>
              <Tag>智能词库 · 发布来源</Tag>
              <Tag color={current ? "success" : "warning"}>
                {current ? "核查时来源有效" : "当前来源已变化"}
              </Tag>
            </Space>
          </div>
          {!current && (
            <Alert
              type="warning"
              showIcon
              title="此处保留题目引用时的发布内容"
              description="来源变化后不能把旧引用自动绑定到新词义；请重新选择当前有效发布来源。"
            />
          )}
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              {
                key: "level",
                label: "来源释义等级",
                children: candidate.level
              },
              {
                key: "profile",
                label: "英美档位",
                children: candidate.answer_profile
              },
              {
                key: "form",
                label: "基础词形",
                children: candidate.accepted_spellings.join(" / ")
              }
            ]}
          />
          {candidate.other_definitions.length > 0 && (
            <div>
              <Typography.Text strong>该词条的其他已发布释义</Typography.Text>
              <ul>
                {[...new Set(candidate.other_definitions)].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <Typography.Text type="secondary">
                核对这些释义是否也可能回答题干，不能只检查当前展示的一个意思。
              </Typography.Text>
            </div>
          )}
          <details>
            <summary>查看发布来源标识</summary>
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: "publication",
                  label: "发布稿",
                  children: candidate.source.publication_id
                },
                {
                  key: "sense",
                  label: "词义",
                  children: candidate.source.sense_id
                },
                {
                  key: "definition",
                  label: "释义",
                  children: candidate.source.definition_id
                },
                {
                  key: "form",
                  label: "词形",
                  children: candidate.source.form_id
                }
              ]}
            />
          </details>
          <Typography.Link
            href={`/words/${candidate.source.entry_id}/v3/wizard/preview`}
            target="_blank"
            rel="noreferrer"
          >
            打开词条编辑预览（可能包含草稿）
          </Typography.Link>
        </Space>
      )}
    </Drawer>
  );
}
