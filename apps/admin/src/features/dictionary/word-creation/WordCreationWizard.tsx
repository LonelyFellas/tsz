import {
  CheckCircleFilled,
  ExclamationCircleOutlined,
  InboxOutlined,
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
import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { useArchiveWord, useRestoreWord, useWordDetail } from "../api";
import { adminWordsDataSourceCapabilities } from "../dataSource";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
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
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const archiveWord = useArchiveWord();
  const snapshot = word.detection_snapshot;
  const discard = () => {
    modal.confirm({
      title: "归档当前草稿并重新检测？",
      icon: <ExclamationCircleOutlined />,
      content:
        "语言和主词是后续内容的稳定基准，不能在已有草稿中直接修改。归档会保留当前草稿及已保存步骤，之后仍可恢复。",
      okText: "归档并重新创建",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await archiveWord.mutateAsync({
            wordId: word.id,
            idempotencyKey: crypto.randomUUID(),
            input: {
              base_revision: word.revision,
              base_lifecycle_revision: word.lifecycle_revision
            }
          });
          message.success("草稿已归档");
          navigate("/words/new", { replace: true });
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : "归档草稿失败"
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
        className="word-snapshot-status"
        type={
          snapshot.builtin_dictionary_status === "matched" ? "success" : "info"
        }
        showIcon
        icon={<CheckCircleFilled />}
        title={
          snapshot.builtin_dictionary_status === "matched"
            ? "词典检测已完成"
            : "短语草稿已创建"
        }
        description={
          snapshot.builtin_dictionary_status === "matched"
            ? "内置词典已匹配，智能词库创建时未发现重复项。"
            : "内置词典未收录该短语，已按规范化输入创建空白 V2 草稿。"
        }
        style={{ marginBottom: 18 }}
      />

      {partOfSpeechCatalog.isError && (
        <Alert
          type="warning"
          showIcon
          title="词性配置加载失败，暂以词性编码显示"
          style={{ marginBottom: 18 }}
        />
      )}

      <Card className="word-snapshot-card" size="small" title="检测与确认快照">
        <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="原始输入">
            {snapshot.request.headword}
          </Descriptions.Item>
          <Descriptions.Item label="归一化主词">
            {snapshot.normalized_headword}
          </Descriptions.Item>
          <Descriptions.Item label="词条类型">
            {word.kind === "phrase" ? "短语" : "单词"}
          </Descriptions.Item>
          <Descriptions.Item label="输入命中">
            {snapshot.matched_dialect === "uk"
              ? "英式英语 · BrE"
              : snapshot.matched_dialect === "us"
                ? "美式英语 · AmE"
                : "Common"}
          </Descriptions.Item>
          <Descriptions.Item label="确认主词" span={2}>
            {snapshot.headwords.mode === "unified" ? (
              <Tag color="green">{snapshot.headwords.common}</Tag>
            ) : (
              <Space>
                <Tag color="blue">英式英语 · BrE · {snapshot.headwords.uk}</Tag>
                <Tag color="magenta">
                  美式英语 · AmE · {snapshot.headwords.us}
                </Tag>
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="原建议基本词性" span={2}>
            <Space wrap>
              {snapshot.suggested_pos.map((pos) => (
                <Tag key={pos}>
                  {partOfSpeechLabel(partOfSpeechLookup, pos)}
                </Tag>
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
          {adminWordsDataSourceCapabilities.archive && (
            <Button
              danger
              icon={<InboxOutlined />}
              loading={archiveWord.isPending}
              onClick={discard}
            >
              归档并重新检测
            </Button>
          )}
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
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { wordId = "", step } = useParams();
  const currentStep: WordCreationStep =
    mode === "create" ? "basics" : isWordCreationStep(step) ? step : "basics";
  const detail = useWordDetail(wordId, mode === "resume" && wordId !== "");
  const restoreWord = useRestoreWord();
  const [word, setWord] = useState<AdminWordV2>();
  const [draftHeadwords, setDraftHeadwords] = useState<WordHeadwordsV2>();
  const explicitEditMode = searchParams.get("mode") === "edit";

  useEffect(() => {
    const loaded = detail.data?.word;
    if (!loaded) return;
    if (!isAdminWordV2(loaded)) {
      navigate(`/words/${loaded.id}/edit`, { replace: true });
      return;
    }
    setWord((current) =>
      !current ||
      loaded.revision > current.revision ||
      (loaded.revision === current.revision &&
        loaded.lifecycle_revision >= current.lifecycle_revision)
        ? loaded
        : current
    );
  }, [detail.data, navigate]);

  const changeStep = (next: WordCreationStep) => {
    if (!word) return;
    const editingPublished = word.status === "published" && explicitEditMode;
    if (word.status === "published" && !editingPublished) {
      navigate(`/words/${word.id}/wizard/preview`);
      return;
    }
    const nextIndex = WORD_STEP_ORDER.indexOf(next);
    const maxIndex = WORD_STEP_ORDER.indexOf(word.max_reachable_step);
    if (nextIndex <= maxIndex) {
      navigate(
        `/words/${word.id}/wizard/${next}${editingPublished ? "?mode=edit" : ""}`
      );
    }
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

  const editingPublished = word.status === "published" && explicitEditMode;
  const legalStep: WordCreationStep =
    word.status === "published" && !editingPublished
      ? "preview"
      : !isWordCreationStep(step) ||
          WORD_STEP_ORDER.indexOf(step) >
            WORD_STEP_ORDER.indexOf(word.max_reachable_step)
        ? word.max_reachable_step
        : step;
  if (step !== legalStep) {
    return (
      <Navigate
        to={`/words/${word.id}/wizard/${legalStep}${editingPublished ? "?mode=edit" : ""}`}
        replace
      />
    );
  }

  const readOnly =
    word.status === "archived" ||
    (word.status === "published" && !editingPublished);
  return (
    <>
      {word.status === "archived" && (
        <Alert
          type="warning"
          showIcon
          title="该词条已归档，当前为只读状态"
          description="恢复不会改写当前或历史发布记录；若线上版本引用了不可用目标，服务端会安全拒绝。"
          action={
            <Button
              icon={<ReloadOutlined />}
              loading={restoreWord.isPending}
              onClick={async () => {
                try {
                  const restored = await restoreWord.mutateAsync({
                    wordId: word.id,
                    idempotencyKey: crypto.randomUUID(),
                    input: {
                      base_revision: word.revision,
                      base_lifecycle_revision: word.lifecycle_revision
                    }
                  });
                  setWord(restored.word);
                  message.success("词条已恢复");
                } catch (error) {
                  message.error(
                    error instanceof Error ? error.message : "恢复失败"
                  );
                }
              }}
            >
              恢复词条
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
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
          <PreviewAndPublishStep
            word={word}
            readOnly={readOnly}
            onPublished={setWord}
          />
        )}
      </WordCreationLayout>
    </>
  );
}
