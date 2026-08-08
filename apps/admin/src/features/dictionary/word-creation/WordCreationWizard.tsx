import {
  CheckCircleFilled,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Result,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  WordCreationStep,
  WordHeadwordsV2
} from "@tsz/types";
import { isAdminWordV2 } from "@tsz/types";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { POS_TAG_ABBR } from "../labels";
import { useDeleteWord, useWordDetail } from "../api";
import { CreateEntryStep } from "./CreateEntryStep";
import { FormsAndPronunciationStep } from "./FormsAndPronunciationStep";
import { MeaningsAndExamplesStep } from "./MeaningsAndExamplesStep";
import { PreviewAndPublishStep } from "./PreviewAndPublishStep";
import { WordCreationLayout } from "./WordCreationLayout";
import { WORD_STEP_ORDER } from "./model";

interface Props {
  mode: "create" | "resume";
}

function isWordCreationStep(value?: string): value is WordCreationStep {
  return WORD_STEP_ORDER.includes(value as WordCreationStep);
}

function ReadOnlyBasicsStep({ word }: { word: AdminWordV2 }) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const removeWord = useDeleteWord();
  const snapshot = word.detection_snapshot;
  const discard = () => {
    modal.confirm({
      title: "废弃当前草稿并重新检测？",
      icon: <ExclamationCircleOutlined />,
      content:
        "语言和主词是后续内容的稳定基准，不能在已有草稿中直接修改。废弃后当前草稿及已保存步骤均不可恢复。",
      okText: "废弃并重新创建",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await removeWord.mutateAsync(word.id);
          message.success("草稿已废弃");
          navigate("/words/new", { replace: true });
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : "废弃草稿失败"
          );
        }
      }
    });
  };
  return (
    <>
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          创建新词条
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          草稿创建后，第 1
          步作为不可变检测基准只读保存。需要更换语言或主词时，请废弃草稿后重新检测。
        </Typography.Paragraph>
      </div>

      <Alert
        type="success"
        showIcon
        icon={<CheckCircleFilled />}
        title="词典检测已完成"
        description="内置词典已匹配，智能词库创建时未发现重复项。"
        style={{ marginBottom: 18 }}
      />

      <Card title="检测与确认快照">
        <Descriptions column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="原始输入">
            {snapshot.request.headword}
          </Descriptions.Item>
          <Descriptions.Item label="归一化主词">
            {snapshot.normalized_headword}
          </Descriptions.Item>
          <Descriptions.Item label="词条类型">单词</Descriptions.Item>
          <Descriptions.Item label="输入命中">
            {snapshot.matched_dialect === "uk"
              ? "British English"
              : snapshot.matched_dialect === "us"
                ? "American English"
                : "Common"}
          </Descriptions.Item>
          <Descriptions.Item label="确认主词" span={2}>
            {snapshot.headwords.mode === "unified" ? (
              <Tag color="green">{snapshot.headwords.common}</Tag>
            ) : (
              <Space>
                <Tag color="blue">BrE · {snapshot.headwords.uk}</Tag>
                <Tag color="magenta">AmE · {snapshot.headwords.us}</Tag>
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="原建议词性" span={2}>
            <Space wrap>
              {snapshot.suggested_pos.map((pos) => (
                <Tag key={pos}>{POS_TAG_ABBR[pos]}</Tag>
              ))}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="检测时间">
            {snapshot.detected_at}
          </Descriptions.Item>
          <Descriptions.Item label="检测 ID">
            <Typography.Text copyable code>
              {snapshot.detection_id}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {word.status === "draft" && (
        <div className="word-step-actions">
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={removeWord.isPending}
            onClick={discard}
          >
            废弃并重新检测
          </Button>
          <Button
            type="primary"
            onClick={() => navigate(`/words/${word.id}/wizard/forms`)}
          >
            进入词形与发音
          </Button>
        </div>
      )}
    </>
  );
}

export function WordCreationWizard({ mode }: Props) {
  const navigate = useNavigate();
  const { wordId = "", step } = useParams();
  const currentStep: WordCreationStep =
    mode === "create" ? "basics" : isWordCreationStep(step) ? step : "basics";
  const detail = useWordDetail(wordId, mode === "resume" && wordId !== "");
  const [word, setWord] = useState<AdminWordV2>();
  const [draftHeadwords, setDraftHeadwords] = useState<WordHeadwordsV2>();

  useEffect(() => {
    const loaded = detail.data?.word;
    if (!loaded) return;
    if (!isAdminWordV2(loaded)) {
      navigate(`/words/${loaded.id}/edit`, { replace: true });
      return;
    }
    setWord((current) =>
      !current || loaded.revision >= current.revision ? loaded : current
    );
  }, [detail.data, navigate]);

  const changeStep = (next: WordCreationStep) => {
    if (!word) return;
    if (word.status === "published") {
      navigate(`/words/${word.id}/wizard/preview`);
      return;
    }
    const nextIndex = WORD_STEP_ORDER.indexOf(next);
    const maxIndex = WORD_STEP_ORDER.indexOf(word.max_reachable_step);
    if (nextIndex <= maxIndex) navigate(`/words/${word.id}/wizard/${next}`);
  };

  if (mode === "create") {
    return (
      <WordCreationLayout currentStep="basics" draftHeadwords={draftHeadwords}>
        <CreateEntryStep
          onHeadwordsChange={setDraftHeadwords}
          onCreated={(created) => {
            setWord(created);
            navigate(`/words/${created.id}/wizard/forms`, { replace: true });
          }}
        />
      </WordCreationLayout>
    );
  }

  if (detail.isPending || (!word && detail.isFetching)) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 420 }}>
        <Spin size="large" description="正在恢复词条草稿" />
      </Flex>
    );
  }

  if (detail.isError || !word) {
    return (
      <Result
        status="error"
        title="词条加载失败"
        subTitle={detail.error?.message ?? "词条不存在或已被删除"}
        extra={[
          <Button
            icon={<ReloadOutlined />}
            key="retry"
            onClick={() => void detail.refetch()}
          >
            重试
          </Button>,
          <Button key="back" type="primary" onClick={() => navigate("/words")}>
            返回智能词库
          </Button>
        ]}
      />
    );
  }

  const legalStep: WordCreationStep =
    word.status === "published"
      ? "preview"
      : !isWordCreationStep(step) ||
          WORD_STEP_ORDER.indexOf(step) >
            WORD_STEP_ORDER.indexOf(word.max_reachable_step)
        ? word.max_reachable_step
        : step;
  if (step !== legalStep) {
    return <Navigate to={`/words/${word.id}/wizard/${legalStep}`} replace />;
  }

  const readOnly = word.status === "published";
  return (
    <WordCreationLayout
      word={word}
      currentStep={currentStep}
      onStepChange={changeStep}
    >
      {currentStep === "basics" && <ReadOnlyBasicsStep word={word} />}
      {currentStep === "forms" && (
        <FormsAndPronunciationStep
          word={word}
          readOnly={readOnly}
          onSaved={setWord}
        />
      )}
      {currentStep === "meanings" && (
        <MeaningsAndExamplesStep
          word={word}
          readOnly={readOnly}
          onSaved={setWord}
        />
      )}
      {currentStep === "preview" && (
        <PreviewAndPublishStep word={word} onPublished={setWord} />
      )}
    </WordCreationLayout>
  );
}
