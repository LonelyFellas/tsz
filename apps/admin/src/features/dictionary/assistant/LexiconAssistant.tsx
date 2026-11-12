import {
  useLexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage as uiMessage
} from "../i18n/editor";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Flex,
  Space,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Drawer, FloatButton } from "@tsz/ui/admin/overlays";
import { Input, type TextAreaRef } from "@tsz/ui/admin/forms";
import { BotIcon, SendIcon, SquareIcon } from "lucide-react";

import {
  HttpError,
  LexiconAssistantResponseError,
  LexiconAssistantInterruptedError
} from "@tsz/api-client";
import type {
  LexiconAssistantHistory,
  LexiconAssistantResponse,
  WordCreationStep
} from "@tsz/types";
import { api } from "@/lib/auth";
import { newWordNodeId } from "../word-model/primitives";
import { assistantSnapshot, type AssistantEditorContext } from "./context";
import "./assistant.css";
import { FormCandidates } from "./FormCandidates";

interface Turn {
  id: string;
  question: string;
  response: Pick<
    LexiconAssistantResponse,
    "answer" | "sources" | "context_summary" | "field_refs"
  >;
  interrupted?: boolean;
  fingerprint: string;
  step: WordCreationStep;
}

function errorMessage(error: unknown) {
  if (error instanceof LexiconAssistantResponseError)
    return uiMessage(`assistant_client_${error.diagnostic}`);
  if (error instanceof HttpError) {
    if (error.status === 409) return uiMessage("assistant_revision");
    if (error.status === 403) return uiMessage("assistant_forbidden");
    if (error.status === 429) return uiMessage("assistant_rate_limit");
    if (error.status === 404 || error.status === 503)
      return uiMessage("assistant_unavailable");
    return error instanceof LexiconAssistantInterruptedError
      ? uiMessage("assistant_client_interrupted")
      : error.message;
  }
  return uiMessage("assistant_failed");
}

const STARTERS: Record<WordCreationStep, string[]> = {
  basics: [
    "这个词应该拆几个词性？",
    "库里有没有同拼写的词条？",
    "结合内置词典给我一些填写建议"
  ],
  forms: [
    "检查词形和发音还缺什么",
    "这些词形的英美拼写和音标对吗？",
    "库里有没有同拼写的词条？"
  ],
  meanings: [
    "检查词义和例句还缺什么",
    "义项划分和 CEFR 合理吗？",
    "结合内置词典看看漏了哪些义项"
  ],
  preview: ["发布前还差什么？", "整体检查一遍有没有前后矛盾的地方"]
};

const STARTER_KEYS = {
  "这个词应该拆几个词性？": "assistant_starter_0",
  "库里有没有同拼写的词条？": "assistant_starter_1",
  结合内置词典给我一些填写建议: "assistant_starter_2",
  检查词形和发音还缺什么: "assistant_starter_3",
  "这些词形的英美拼写和音标对吗？": "assistant_starter_4",
  检查词义和例句还缺什么: "assistant_starter_6",
  "义项划分和 CEFR 合理吗？": "assistant_starter_7",
  结合内置词典看看漏了哪些义项: "assistant_starter_8",
  "发布前还差什么？": "assistant_starter_9",
  整体检查一遍有没有前后矛盾的地方: "assistant_starter_10"
} as const;

export function LexiconAssistant({
  context
}: {
  context: AssistantEditorContext;
}) {
  const { t } = useLexiconEditorTranslation();
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [structuredDraft, setStructuredDraft] = useState(false);
  const [question, setQuestion] = useState("");
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useLexiconEditorMessageState();
  const [liveAnswer, setLiveAnswer] = useState("");
  const [liveStatus, setLiveStatus] = useState<string>();
  const partial = useRef<Turn | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const capabilityRequest = useRef<AbortController | undefined>(undefined);
  const input = useRef<TextAreaRef>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const snapshot = assistantSnapshot(context);

  const checkAvailability = async () => {
    capabilityRequest.current?.abort();
    const controller = new AbortController();
    capabilityRequest.current = controller;
    setChecking(true);
    try {
      const result = await api.lexiconAssistant.capability(controller.signal);
      if (!controller.signal.aborted) {
        setAvailability(result.available ? "ready" : "unavailable");
        setStructuredDraft(result.features?.structured_draft === true);
      }
    } catch {
      if (!controller.signal.aborted) setAvailability("unavailable");
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  };

  useEffect(() => {
    if (open && availability === "checking") void checkAvailability();
    return () => {
      if (!open) capabilityRequest.current?.abort();
    };
    // Availability is loaded lazily when the panel first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      request.current?.abort();
      capabilityRequest.current?.abort();
    },
    []
  );
  useEffect(() => {
    transcript.current?.scrollTo?.({
      top: transcript.current.scrollHeight,
      behavior: "auto"
    });
  }, [turns, pending, liveAnswer]);

  const keepPartial = () => {
    if (partial.current?.response.answer.trim()) {
      const value = { ...partial.current, interrupted: true };
      setTurns((previous) => [...previous, value]);
    }
    partial.current = undefined;
    setLiveAnswer("");
  };

  const send = async () => {
    const value = question.trim();
    if (!value || request.current || candidateBusy || availability !== "ready")
      return;
    const captured = assistantSnapshot(context);
    const controller = new AbortController();
    request.current = controller;
    const contextId = newWordNodeId();
    setError(undefined);
    setPending(value);
    setLiveAnswer("");
    setLiveStatus(undefined);
    partial.current = {
      id: contextId,
      question: value,
      response: { answer: "", sources: [] },
      fingerprint: captured.fingerprint,
      step: context.step
    };
    const history: LexiconAssistantHistory[] = turns
      .filter((turn) => !turn.interrupted)
      .slice(-3)
      .flatMap((turn) => [
        {
          role: "user" as const,
          content: Array.from(turn.question).slice(0, 4000).join("")
        },
        {
          role: "assistant" as const,
          content: Array.from(
            `${turn.response.context_summary ? `资料摘要：${turn.response.context_summary}\n` : ""}${turn.response.answer}\n查询依据：${turn.response.sources.map((source) => `${source.label}${source.version ? `（${source.version}）` : ""}`).join("；")}`
          )
            .slice(0, 4000)
            .join("")
        }
      ]);
    try {
      const response = await api.lexiconAssistant.askStream(
        {
          entry_id: context.word.id,
          base_revision: context.word.revision,
          context_id: contextId,
          step: context.step,
          local_content: captured.local_content,
          context_truncated: captured.context_truncated,
          question: value,
          history,
          ...(structuredDraft
            ? { draft: captured.draft, extensions: true }
            : {})
        },
        (event) => {
          if (request.current !== controller || controller.signal.aborted)
            return;
          if (event.event === "status") setLiveStatus(event.message);
          if (event.event === "reset") {
            if (partial.current) partial.current.response.answer = "";
            setLiveAnswer("");
          }
          if (event.event === "delta" && partial.current) {
            partial.current.response.answer += event.text;
            setLiveAnswer(partial.current.response.answer);
          }
        },
        controller.signal
      );
      if (request.current !== controller || controller.signal.aborted) return;
      setTurns((previous) => [
        ...previous,
        {
          id: contextId,
          question: value,
          response,
          fingerprint: captured.fingerprint,
          step: context.step
        }
      ]);
      partial.current = undefined;
      setLiveAnswer("");
      setQuestion("");
      input.current?.focus();
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted) {
        keepPartial();
        setError(errorMessage(cause));
      }
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(undefined);
      }
    }
  };

  const stop = () => {
    keepPartial();
    request.current?.abort();
    request.current = undefined;
    setPending(undefined);
    setError(uiMessage("assistant_stopped"));
  };

  return (
    <>
      {!open && (
        <FloatButton
          icon={<BotIcon />}
          content={t("assistant_short")}
          shape="square"
          aria-label={t("assistant_open")}
          tooltip={{ title: t("assistant_title") }}
          onClick={() => setOpen(true)}
          className="lexicon-assistant-launcher"
        />
      )}
      <Drawer
        title={
          <Space>
            <BotIcon />
            <span>{t("assistant_title")}</span>
          </Space>
        }
        open={open}
        onClose={() => setOpen(false)}
        size="min(440px, 100vw)"
        mask={false}
        classNames={{ body: "lexicon-assistant-body" }}
        afterOpenChange={(visible) => {
          if (visible) input.current?.focus();
        }}
      >
        <div className="lexicon-assistant-context">
          <Typography.Text strong>
            {context.word.presentation.label || t("assistant_current_entry")}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t("assistant_context", {
              step: t(`assistant_step_${context.step}`)
            })}
          </Typography.Text>
        </div>
        {availability === "checking" && (
          <Spin description={t("assistant_connecting")}>
            <div className="lexicon-assistant-connecting" />
          </Spin>
        )}
        {availability === "unavailable" && (
          <Alert
            type="info"
            showIcon
            title={t("assistant_not_ready")}
            description={t("assistant_not_ready_help")}
            action={
              <Button
                size="small"
                loading={checking}
                onClick={() => void checkAvailability()}
              >
                {t("assistant_reconnect")}
              </Button>
            }
          />
        )}
        <div
          className="lexicon-assistant-transcript"
          ref={transcript}
          role="log"
          aria-label={t("assistant_log")}
          aria-live="polite"
        >
          {turns.length === 0 && !pending && (
            <div className="lexicon-assistant-welcome">
              <Flex vertical gap={8}>
                {STARTERS[context.step].map((starter) => (
                  <Button
                    key={starter}
                    className="lexicon-assistant-starter"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setQuestion(starter);
                      input.current?.focus();
                    }}
                  >
                    {t(STARTER_KEYS[starter as keyof typeof STARTER_KEYS])}
                  </Button>
                ))}
              </Flex>
            </div>
          )}
          {turns.map((turn) => (
            <section className="lexicon-assistant-turn" key={turn.id}>
              <div className="lexicon-assistant-question">{turn.question}</div>
              <div className="lexicon-assistant-answer">
                <Typography.Text strong>{t("assistant_name")}</Typography.Text>
                {turn.fingerprint !== snapshot.fingerprint && (
                  <Typography.Text
                    type="secondary"
                    className="lexicon-assistant-stale"
                  >
                    {t("assistant_stale", {
                      step: t(`assistant_step_${turn.step}`)
                    })}
                  </Typography.Text>
                )}
                <Typography.Paragraph className="lexicon-assistant-answer-text">
                  {turn.response.answer}
                </Typography.Paragraph>
                {turn.fingerprint === snapshot.fingerprint &&
                context.navigateField &&
                turn.response.field_refs?.length ? (
                  <Space wrap>
                    {turn.response.field_refs.map((ref) => (
                      <Button
                        key={ref.path}
                        size="small"
                        onClick={() => {
                          setOpen(false);
                          context.navigateField?.(ref.path);
                        }}
                      >
                        {t("assistant_locate", { label: ref.label })}
                      </Button>
                    ))}
                  </Space>
                ) : null}
                {turn.response.sources.length > 0 && (
                  <details className="lexicon-assistant-sources">
                    <summary>
                      {t("assistant_sources", {
                        count: turn.response.sources.length
                      })}
                    </summary>
                    <ul>
                      {turn.response.sources.map((source) => (
                        <li
                          key={JSON.stringify([
                            source.kind,
                            source.label,
                            source.entry_id,
                            source.version
                          ])}
                        >
                          {source.entry_id ? (
                            <Link
                              target="_blank"
                              rel="noopener noreferrer"
                              to={`/words/${source.entry_id}/v3/wizard/preview`}
                            >
                              {source.label}
                            </Link>
                          ) : (
                            <span>{source.label}</span>
                          )}
                          {source.version && (
                            <Typography.Text type="secondary">
                              {" "}
                              · {source.version}
                            </Typography.Text>
                          )}
                          {source.truncated && (
                            <Tag>{t("assistant_partial_source")}</Tag>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {turn.interrupted && (
                  <Typography.Text type="warning">
                    {t("assistant_interrupted")}
                  </Typography.Text>
                )}
                {!turn.interrupted && turn.response.sources.length === 0 && (
                  <Typography.Text type="secondary">
                    {t("assistant_no_sources")}
                  </Typography.Text>
                )}
              </div>
            </section>
          ))}
          {pending && (
            <div className="lexicon-assistant-turn">
              <div className="lexicon-assistant-question">{pending}</div>
              <Space role="status">
                <Spin size="small" />
                <span>{liveStatus ?? t("assistant_reading")}</span>
              </Space>
              {liveAnswer && (
                <Typography.Paragraph className="lexicon-assistant-answer-text">
                  {liveAnswer}
                </Typography.Paragraph>
              )}
            </div>
          )}
        </div>
        <div className="lexicon-assistant-composer">
          <FormCandidates
            context={context}
            disabled={!!pending || availability !== "ready"}
            onBusyChange={setCandidateBusy}
          />
          {error && <Alert type="warning" showIcon title={error} />}
          {snapshot.context_truncated && (
            <Typography.Text type="secondary">
              {t("assistant_truncated")}
            </Typography.Text>
          )}
          <Input.TextArea
            ref={input}
            value={question}
            aria-label={t("assistant_input")}
            placeholder={t("assistant_placeholder")}
            maxLength={2000}
            autoSize={{ minRows: 3, maxRows: 6 }}
            disabled={Boolean(pending)}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key === "Enter" &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Typography.Text type="secondary">
              {t("assistant_disclaimer")}
            </Typography.Text>
            {pending ? (
              <Button
                aria-label={t("assistant_stop")}
                icon={<SquareIcon />}
                onClick={stop}
              >
                {t("assistant_stop")}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendIcon />}
                disabled={
                  !question.trim() || availability !== "ready" || candidateBusy
                }
                onClick={() => void send()}
              >
                {t("assistant_send")}
              </Button>
            )}
          </Flex>
        </div>
      </Drawer>
    </>
  );
}
