import {
  CheckCircleFilled,
  ExclamationCircleOutlined,
  DeleteOutlined,
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
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  WordCreationStep,
  WordHeadwordsV2
} from "@tsz/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  Link,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { useDeleteWordDraft, useRestoreWord, useWordDetail } from "../api";
import { LifecycleSurfaceConfirmation } from "../LifecycleSurfaceConfirmation";
import { STATUS_LABEL } from "../labels";
import { runLifecycleCommandOnce } from "../lifecycleCommand";
import { useLifecycleSurfaceCommand } from "../useLifecycleSurfaceCommand";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { CreateEntryStep } from "./CreateEntryStep";
import { FormsAndPronunciationStep } from "./FormsAndPronunciationStep";
import {
  createFormVariantIdentityLedger,
  rememberRetiredStableSlots
} from "./formVariantIdentity";
import { MeaningsAndExamplesStep } from "./MeaningsAndExamplesStep";
import { PreviewAndPublishStep } from "./PreviewAndPublishStep";
import { WordCreationLayout } from "./WordCreationLayout";
import { WORD_STEP_ORDER } from "./model";
import type { ReadinessTarget } from "./readiness";

interface Props {
  mode: "create" | "resume";
}

function isWordCreationStep(value?: string): value is WordCreationStep {
  return WORD_STEP_ORDER.includes(value as WordCreationStep);
}

function snapshotMatchCategoryLabel(category: string) {
  switch (category) {
    case "exact_headword":
      return "同名主词";
    case "cross_kind_headword":
      return "跨类型同名主词";
    case "headword_form":
      return "命中已有词形";
    case "form_headword":
      return "词形命中已有主词";
    default:
      return "同形词形";
  }
}

const SNAPSHOT_DIALECT_LABEL = {
  uk: "BrE",
  us: "AmE",
  common: "Common"
} as const;

function ReadOnlyBasicsStep({ word }: { word: AdminWordV2 }) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const deleteDraft = useDeleteWordDraft();
  const lifecycleCommandPending = useRef(false);
  const snapshot = word.detection_snapshot;
  const surfaceWarning =
    snapshot.smart_dictionary_status === "warning"
      ? snapshot.surface_warning
      : undefined;
  const discard = () => {
    modal.confirm({
      title: "删除当前草稿并重新检测？",
      icon: <ExclamationCircleOutlined />,
      content:
        "语言和主词是后续内容的稳定基准，不能在已有草稿中直接修改。删除将永久清除当前未发布草稿及已保存步骤，并释放词头。",
      okText: "删除并重新创建",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            await deleteDraft.mutateAsync({
              wordId: word.id,
              baseRevision: word.revision,
              baseLifecycleRevision: word.lifecycle_revision
            });
            message.success("草稿已删除");
            navigate(`/words/new?kind=${word.kind}`, { replace: true });
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : "删除草稿失败"
            );
          }
        })
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
          步作为不可变检测基准只读保存。需要更换语言或主词时，请删除未发布草稿后重新检测。
        </Typography.Paragraph>
      </div>

      <Alert
        className="word-snapshot-status"
        type={
          surfaceWarning
            ? "warning"
            : snapshot.builtin_dictionary_status === "matched"
              ? "success"
              : "info"
        }
        showIcon
        icon={
          surfaceWarning ? <ExclamationCircleOutlined /> : <CheckCircleFilled />
        }
        title={
          surfaceWarning
            ? "创建时发现同名或同形词条，管理员已确认继续"
            : snapshot.builtin_dictionary_status === "matched"
              ? "词典检测已完成"
              : "短语草稿已创建"
        }
        description={
          surfaceWarning
            ? `已确认 ${surfaceWarning.total} 条匹配，当前展示 ${surfaceWarning.preview.length} 条摘要。`
            : snapshot.builtin_dictionary_status === "matched"
              ? "内置词典已匹配，智能词库创建时未发现重复项。"
              : "内置词典未收录该短语，已按规范化输入创建空白短语草稿。"
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
          <Descriptions.Item label="词条主词" span={2}>
            {word.headwords.mode === "unified" ? (
              <Tag color="green">{word.headwords.common}</Tag>
            ) : (
              <Space>
                <Tag color="blue">英式英语 · BrE · {word.headwords.uk}</Tag>
                <Tag color="magenta">美式英语 · AmE · {word.headwords.us}</Tag>
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
          {surfaceWarning && (
            <>
              <Descriptions.Item label="确认策略">
                {surfaceWarning.policy_name} · epoch{" "}
                {surfaceWarning.policy_epoch}
              </Descriptions.Item>
              <Descriptions.Item label="确认时间">
                {surfaceWarning.acknowledged_at}
              </Descriptions.Item>
              <Descriptions.Item label="确认管理员" span={2}>
                <Typography.Text copyable code>
                  {surfaceWarning.acknowledged_by}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="匹配摘要" span={2}>
                <Space orientation="vertical" size={6}>
                  {surfaceWarning.preview.map((item) => (
                    <Space key={item.match_id} wrap>
                      <Link
                        to={`/words/${item.existing_word_id}/wizard/basics`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${item.existing_headword} ${item.existing_word_id}，在新标签页打开`}
                      >
                        {item.existing_headword}
                      </Link>
                      <Tag>
                        {snapshotMatchCategoryLabel(item.match_category)}
                      </Tag>
                      <Tag>{STATUS_LABEL[item.existing_status]}</Tag>
                      <Tag>
                        {item.existing_kind === "phrase" ? "短语" : "单词"}
                      </Tag>
                      <Tag>{SNAPSHOT_DIALECT_LABEL[item.existing_dialect]}</Tag>
                      {item.pos_labels.map((pos) => (
                        <Tag key={pos}>
                          {partOfSpeechLabel(partOfSpeechLookup, pos)}
                        </Tag>
                      ))}
                      {item.gloss_previews.length > 0 && (
                        <Typography.Text type="secondary">
                          {item.gloss_previews.join("；")}
                        </Typography.Text>
                      )}
                      <Typography.Text code>
                        {item.existing_word_id.slice(-8)}
                      </Typography.Text>
                    </Space>
                  ))}
                  {surfaceWarning.truncated && (
                    <Typography.Text type="secondary">
                      仅展示 {surfaceWarning.preview.length}/
                      {surfaceWarning.total}{" "}
                      条不可变摘要；完整审计以服务端记录为准。
                    </Typography.Text>
                  )}
                </Space>
              </Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Card>

      {word.status === "draft" && (
        <div className="word-step-actions">
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={deleteDraft.isPending}
            onClick={discard}
          >
            删除草稿并重新检测
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
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { wordId = "", step } = useParams();
  const currentStep: WordCreationStep =
    mode === "create" ? "basics" : isWordCreationStep(step) ? step : "basics";
  const detail = useWordDetail(wordId, mode === "resume" && wordId !== "");
  const readinessCatalog = usePartOfSpeechCatalog();
  const readinessPartOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(readinessCatalog.data),
    [readinessCatalog.data]
  );
  // 词形变体的节点身份账本挂在向导上：步骤组件切走会卸载，账本跟着卸载就会
  // 丢掉已退役的方言节点 ID，返回词形步再合并英美就会被后端判 ID 换槽位。
  const identityLedger = useRef(createFormVariantIdentityLedger()).current;
  const restoreWord = useRestoreWord();
  const restoreSurface = useLifecycleSurfaceCommand(wordId);
  const lifecycleCommandPending = useRef(false);
  const [pendingRestoreTarget, setPendingRestoreTarget] =
    useState<AdminWordV2>();
  const [word, setWord] = useState<AdminWordV2>();
  const [draftHeadwords, setDraftHeadwords] = useState<WordHeadwordsV2>();
  const [draftForms, setDraftForms] = useState<DraftFormsStepContent>();
  const [draftMeanings, setDraftMeanings] =
    useState<DraftMeaningsStepContent>();
  const explicitEditMode = searchParams.get("mode") === "edit";
  const requestedKind = searchParams.get("kind");
  const entryKind =
    requestedKind === "word" || requestedKind === "phrase"
      ? requestedKind
      : undefined;

  useEffect(() => {
    const draft = detail.data;
    const loaded = draft?.word;
    if (!draft || !loaded) return;
    // 刷新或换设备后账本是空的：退役身份只有草稿响应带得回来，必须在任何一步
    // 开始编辑之前先补进账本，否则合并回共用会重新铸 ID 而被判身份换槽位。
    rememberRetiredStableSlots(identityLedger, draft.retired_stable_slots);
    setWord((current) =>
      !current ||
      loaded.revision > current.revision ||
      (loaded.revision === current.revision &&
        loaded.lifecycle_revision >= current.lifecycle_revision)
        ? loaded
        : current
    );
  }, [detail.data, identityLedger, navigate]);

  useEffect(() => {
    setDraftForms(undefined);
    setDraftMeanings(undefined);
  }, [word?.id]);

  const updateDraftForms = useCallback(
    (content: DraftFormsStepContent) => setDraftForms(content),
    []
  );
  const updateDraftMeanings = useCallback(
    (content: DraftMeaningsStepContent) => setDraftMeanings(content),
    []
  );

  const changeStep = (next: WordCreationStep) => {
    if (!word) return;
    const editingPublished = word.status === "published" && explicitEditMode;
    if (word.status === "published" && !editingPublished) {
      navigate(`/words/${word.id}/wizard/preview`);
      return;
    }
    navigate(
      `/words/${word.id}/wizard/${next}${editingPublished ? "?mode=edit" : ""}`
    );
  };

  const navigateToReadinessTarget = (target: ReadinessTarget) => {
    if (!word) return;
    navigate(
      `/words/${word.id}/wizard/${target.step}${word.status === "published" && explicitEditMode ? "?mode=edit" : ""}`,
      {
        state: {
          nodeId: target.node_id,
          field: target.field,
          ...(target.pos_id ? { posId: target.pos_id } : {})
        }
      }
    );
  };

  const restoreArchivedWord = (refresh = false) =>
    runLifecycleCommandOnce(lifecycleCommandPending, async () => {
      try {
        const latest =
          refresh || !pendingRestoreTarget ? await detail.refetch() : undefined;
        const target =
          (!refresh ? pendingRestoreTarget : undefined) ??
          latest?.data?.word ??
          detail.data?.word;
        if (!target || target.status !== "archived") {
          restoreSurface.clear();
          setPendingRestoreTarget(undefined);
          if (target) setWord(target);
          message.warning("词条状态已变化，已重新加载最新详情");
          return;
        }
        setPendingRestoreTarget(target);
        const outcome = await restoreSurface.run((idempotencyKey, token) =>
          restoreWord.mutateAsync({
            wordId: target.id,
            idempotencyKey,
            input: {
              base_revision: target.revision,
              base_lifecycle_revision: target.lifecycle_revision,
              ...(token ? { confirmed_surface_match_token: token } : {})
            }
          })
        );
        if (outcome.ok) {
          setPendingRestoreTarget(undefined);
          setWord(outcome.result.word);
          message.success("词条已恢复");
        } else if (
          outcome.error.code ===
          "multiple_active_exact_headword_publications_not_enabled"
        ) {
          message.warning("学习端暂不支持多个同名公开词条");
        } else if (outcome.refreshRequired) {
          restoreSurface.clear();
          setPendingRestoreTarget(undefined);
          const refreshed = await detail.refetch();
          if (refreshed.data?.word) setWord(refreshed.data.word);
          message.warning("词条状态或确认策略已变化，请重新发起恢复");
        } else {
          message.warning("恢复条件已变化，请查看最新确认信息");
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : "恢复失败");
      }
    });

  if (mode === "create") {
    return (
      <WordCreationLayout
        entryKind={entryKind}
        currentStep="basics"
        draftHeadwords={draftHeadwords}
      >
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
  // 只归一「非法 step 名」与「已发布锁 preview」两种；进度不再限制可进入的步骤。
  const legalStep: WordCreationStep =
    word.status === "published" && !editingPublished
      ? "preview"
      : isWordCreationStep(step)
        ? step
        : word.max_reachable_step;
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
              onClick={() => void restoreArchivedWord()}
            >
              恢复词条
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {word.status === "archived" && restoreSurface.page && (
        <LifecycleSurfaceConfirmation
          state={restoreSurface.snapshot}
          confirming={restoreWord.isPending}
          onConfirm={() => void restoreArchivedWord()}
          onRestart={() => {
            restoreSurface.clear();
            setPendingRestoreTarget(undefined);
            void restoreArchivedWord(true);
          }}
        />
      )}
      <WordCreationLayout
        word={word}
        entryKind={word.kind}
        currentStep={currentStep}
        readOnly={readOnly}
        onStepChange={changeStep}
        partOfSpeechLookup={readinessPartOfSpeechLookup}
        readinessDraft={
          currentStep === "forms"
            ? { forms: draftForms }
            : currentStep === "meanings"
              ? { meanings: draftMeanings }
              : undefined
        }
        onReadinessNavigate={navigateToReadinessTarget}
      >
        {currentStep === "basics" && <ReadOnlyBasicsStep word={word} />}
        {currentStep === "forms" && (
          <FormsAndPronunciationStep
            word={word}
            readOnly={readOnly}
            onSaved={setWord}
            onDraftChange={updateDraftForms}
            identityLedger={identityLedger}
          />
        )}
        {currentStep === "meanings" && (
          <MeaningsAndExamplesStep
            word={word}
            readOnly={readOnly}
            onSaved={setWord}
            onDraftChange={updateDraftMeanings}
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
