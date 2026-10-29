import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Pagination,
  Space,
  Tag,
  Typography
} from "antd";
import type { AdminProfile, BankQuestion, QuestionCandidate } from "@tsz/types";
import { api } from "@/lib/auth";

export function CandidatePicker({
  profile,
  question,
  options,
  index,
  allowCurrent,
  onClose,
  onChoose
}: {
  profile: AdminProfile;
  question: BankQuestion;
  options: QuestionCandidate[];
  index: number | null;
  allowCurrent: boolean;
  onClose: () => void;
  onChoose: (candidate: QuestionCandidate) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const excluded = options.filter((_, i) => i !== index || !allowCurrent);
  const request = {
    question_level: question.content.question_level,
    answer_profile: question.content.answer_profile,
    part_of_speech: question.content.target.part_of_speech,
    excluded_definition: question.content.target.definition,
    target_spelling: question.content.target.spelling,
    exclude_entry_ids: [...new Set(excluded.map((c) => c.source.entry_id))],
    exclude_spellings: [
      ...new Set(excluded.flatMap((c) => [...c.accepted_spellings, c.spelling]))
    ],
    query,
    page,
    page_size: 10,
    editable_only: false
  };
  const candidates = useQuery({
    queryKey: [
      "question-bank",
      profile.id,
      "replacement-page",
      question.id,
      index,
      request
    ],
    queryFn: ({ signal }) =>
      api.questionBank.searchCandidates(request, { signal }),
    enabled: index !== null,
    retry: false
  });
  return (
    <Drawer
      title={
        index === null
          ? "更换干扰项"
          : `更换选项 ${String.fromCharCode(65 + index)}`
      }
      open={index !== null}
      onClose={onClose}
      size={620}
    >
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <div className="qbw-picker-target">
          <Typography.Text strong className="tsz-words">
            {question.content.target.spelling}
          </Typography.Text>
          <span>
            {question.content.target.part_of_speech} ·{" "}
            {question.content.target.definition}
          </span>
          <Tag>
            {question.content.question_level} /{" "}
            {question.content.answer_profile}
          </Tag>
        </div>
        <Alert
          type="info"
          showIcon
          title="只从已发布的智能词库选择"
          description="候选已按词性、等级、档位、重复词条和有效拼写过滤。优先选看似合理、实际不符合题干的词；相关或相似不能证明答案唯一。"
        />
        <Input.Search
          aria-label="搜索干扰项候选"
          placeholder="输入英文或中文释义"
          allowClear
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
          loading={candidates.isFetching}
        />
        {candidates.isError ? (
          <Alert
            type="error"
            showIcon
            title={candidates.error.message}
            action={
              <Button onClick={() => void candidates.refetch()}>重试</Button>
            }
          />
        ) : candidates.data?.items.length === 0 ? (
          <Empty description="没有符合条件的已发布候选。可以调整搜索，当前选项保持不变。" />
        ) : (
          <div aria-busy={candidates.isFetching}>
            {candidates.data?.items.map((c) => (
              <div className="qbw-candidate" key={c.candidate_ref}>
                <div>
                  <div>
                    <Typography.Text strong className="tsz-words">
                      {c.spelling}
                    </Typography.Text>{" "}
                    <Tag>
                      {c.part_of_speech} · {c.level}
                    </Tag>
                  </div>
                  <p>{c.definition}</p>
                  <Typography.Text type="secondary">
                    已发布智能词库 · {c.answer_profile}
                  </Typography.Text>
                </div>
                <Button
                  disabled={candidates.isFetching}
                  onClick={() => onChoose(c)}
                >
                  使用此词义
                </Button>
              </div>
            ))}
          </div>
        )}
        <Pagination
          current={page}
          pageSize={10}
          total={candidates.data?.pagination.total ?? 0}
          showSizeChanger={false}
          onChange={setPage}
        />
        <Typography.Paragraph type="secondary">
          更换后需重新说明为什么容易混淆、为什么错误。没有理想候选时可取次优，但不能使用库外词、未发布词义或另一个正确答案凑数。
        </Typography.Paragraph>
      </Space>
    </Drawer>
  );
}
