import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Space,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Drawer, FloatButton } from "@tsz/ui/admin/overlays";
import { Input, type TextAreaRef } from "@tsz/ui/admin/forms";
import { BotIcon, SendIcon, SquareIcon } from "lucide-react";

import { HttpError } from "@tsz/api-client";
import type {
  LexiconAssistantHistory,
  LexiconAssistantResponse,
  WordCreationStep
} from "@tsz/types";
import { api } from "@/lib/auth";
import { newWordNodeId } from "../word-model/primitives";
import {
  ASSISTANT_STEP_LABELS,
  assistantSnapshot,
  type AssistantEditorContext
} from "./context";
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
  step: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409)
      return "词条版本已更新，请核对当前编辑后重新提问。";
    if (error.status === 403) return "当前没有词库查询权限，请联系管理员。";
    if (error.status === 429) return "助手正在回答或提问过于频繁，请稍后重试。";
    if (error.status === 404 || error.status === 503)
      return "词库助手暂时不可用，请稍后重试。";
  }
  return "这次未能完成回答，请重试。问题和当前编辑已保留。";
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

export function LexiconAssistant({
  context
}: {
  context: AssistantEditorContext;
}) {
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [structuredDraft, setStructuredDraft] = useState(false);
  const [question, setQuestion] = useState("");
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [liveAnswer, setLiveAnswer] = useState("");
  const [liveStatus, setLiveStatus] = useState("正在读取当前编辑内容…");
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
    partial.current = {
      id: contextId,
      question: value,
      response: { answer: "", sources: [] },
      fingerprint: captured.fingerprint,
      step: ASSISTANT_STEP_LABELS[context.step]
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
          step: ASSISTANT_STEP_LABELS[context.step]
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
    setError("已停止等待，问题已保留。已发出的模型请求可能仍会产生用量。");
  };

  return (
    <>
      {!open && (
        <FloatButton
          icon={<BotIcon />}
          content="助手"
          shape="square"
          aria-label="打开词库小精灵"
          tooltip={{ title: "词库小精灵" }}
          onClick={() => setOpen(true)}
          className="lexicon-assistant-launcher"
        />
      )}
      <Drawer
        title={
          <Space>
            <BotIcon />
            <span>词库小精灵</span>
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
            {context.word.presentation.label || "当前词条"}
          </Typography.Text>
          <Typography.Text type="secondary">
            {ASSISTANT_STEP_LABELS[context.step]} · 包含当前未保存内容
          </Typography.Text>
        </div>
        {availability === "checking" && (
          <Spin description="正在连接助手">
            <div className="lexicon-assistant-connecting" />
          </Spin>
        )}
        {availability === "unavailable" && (
          <Alert
            type="info"
            showIcon
            title="助手暂未就绪"
            description="当前编辑可以继续。助手连接恢复后即可查询词库、内置词典并获取建议。"
            action={
              <Button
                size="small"
                loading={checking}
                onClick={() => void checkAvailability()}
              >
                重试连接
              </Button>
            }
          />
        )}
        <div
          className="lexicon-assistant-transcript"
          ref={transcript}
          role="log"
          aria-label="词库助手对话"
          aria-live="polite"
        >
          {turns.length === 0 && !pending && (
            <div className="lexicon-assistant-welcome">
              <Empty
                image={<BotIcon />}
                description={
                  <>
                    <Typography.Title level={5}>
                      一起把词条填写清楚
                    </Typography.Title>
                    <Typography.Paragraph type="secondary">
                      我可以查智能词库和内置词典，结合你正在编辑的内容，解释字段、比较词义、提供建议。
                    </Typography.Paragraph>
                  </>
                }
              />
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
                    {starter}
                  </Button>
                ))}
              </Flex>
            </div>
          )}
          {turns.map((turn) => (
            <section className="lexicon-assistant-turn" key={turn.id}>
              <div className="lexicon-assistant-question">{turn.question}</div>
              <div className="lexicon-assistant-answer">
                <Typography.Text strong>小精灵</Typography.Text>
                {turn.fingerprint !== snapshot.fingerprint && (
                  <Typography.Text
                    type="secondary"
                    className="lexicon-assistant-stale"
                  >
                    基于此前的{turn.step}内容
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
                        定位：{ref.label}
                      </Button>
                    ))}
                  </Space>
                ) : null}
                {turn.response.sources.length > 0 && (
                  <details className="lexicon-assistant-sources">
                    <summary>
                      查看本次查询依据（{turn.response.sources.length}）
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
                          {source.truncated && <Tag>部分内容</Tag>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {turn.interrupted && (
                  <Typography.Text type="warning">
                    回答未完成，已保留收到的内容。
                  </Typography.Text>
                )}
                {!turn.interrupted && turn.response.sources.length === 0 && (
                  <Typography.Text type="secondary">
                    本次未查询外部资料，回答为模型建议。
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
                <span>{liveStatus}</span>
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
              词条内容较多，本次仅附带部分编辑内容；可针对具体词义提问。
            </Typography.Text>
          )}
          <Input.TextArea
            ref={input}
            value={question}
            aria-label="向词库小精灵提问"
            placeholder="哪里拿不准，问问小精灵…"
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
          <Flex justify="space-between" align="center" gap={12}>
            <Typography.Text type="secondary">
              建议供核查，内容由你决定。
            </Typography.Text>
            {pending ? (
              <Button aria-label="停止" icon={<SquareIcon />} onClick={stop}>
                停止
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
                发送
              </Button>
            )}
          </Flex>
        </div>
      </Drawer>
    </>
  );
}
