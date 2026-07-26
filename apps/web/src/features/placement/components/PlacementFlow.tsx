"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assessmentClient } from "../lib/client";
import { MAX_TESTS, readQuota, type QuotaState } from "../lib/quota";
import {
  QuotaExhaustedError,
  type AssessmentAnswer,
  type Band,
  type BlockItem
} from "../lib/types";
import { ConfirmSheet } from "./ConfirmSheet";
import { InvalidScreen } from "./InvalidScreen";
import { QuizScreen } from "./QuizScreen";
import { ResultScreen } from "./ResultScreen";
import { WelcomeScreen } from "./WelcomeScreen";

// 定级测试流程编排:welcome → quiz → result / invalid。
// 服务端(现为 mock)权威:升降档、真假词、次数校验全在 client 之后,
// 本组件只管屏幕流转与整块提交;测完经 /onboarding?level=XX 回填学习设置。

type Screen = "welcome" | "quiz" | "result" | "invalid";

interface ConfirmState {
  title: string;
  desc: string;
  ok: string;
  action: () => void;
}

export function PlacementFlow() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("welcome");
  // RouteGuard 在 hydrated 前不渲染子树,本组件只在客户端挂载,
  // 因此可以直接惰性读 localStorage,无 SSR/CSR 不一致问题
  const [quota, setQuota] = useState<QuotaState>(() => readQuota());
  const [resultBand, setResultBand] = useState<Band | null>(null);
  const [fresh, setFresh] = useState(false);

  const [block, setBlock] = useState<BlockItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const sessionRef = useRef<string | null>(null);
  const pendingRef = useRef<AssessmentAnswer[]>([]);
  const shownAtRef = useRef(0);

  // 当前词展示时刻,作答时算 rt_ms
  useEffect(() => {
    if (screen === "quiz" && !submitting)
      shownAtRef.current = performance.now();
  }, [screen, block, idx, submitting]);

  async function startTest() {
    setConfirm(null);
    setStartError("");
    setStarting(true);
    try {
      const res = await assessmentClient.start();
      sessionRef.current = res.session_id;
      pendingRef.current = [];
      setBlock(res.block);
      setIdx(0);
      setAnswered(0);
      setSubmitError(false);
      setScreen("quiz");
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        setQuota(readQuota());
        setScreen("welcome");
      } else {
        setStartError("开始测试失败，请稍后重试");
      }
    } finally {
      setStarting(false);
    }
  }

  async function submitBlock() {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await assessmentClient.submit(sessionId, pendingRef.current);
      // 过期守卫:等待期间会话已被清(如退出测试),丢弃迟到的响应,
      // 避免把用户从欢迎屏拽进结果屏。提交中 ✕ 已禁用,此为兜底。
      if (sessionRef.current !== sessionId) return;
      if ("next_block" in res) {
        pendingRef.current = [];
        setBlock(res.next_block);
        setIdx(0);
        return;
      }
      sessionRef.current = null;
      pendingRef.current = [];
      if (res.result.state === "completed") {
        setQuota(readQuota());
        setResultBand(res.result.band);
        setFresh(true);
        setScreen("result");
      } else {
        setScreen("invalid");
      }
    } catch {
      // 已答的一块保留在 pendingRef,重试直接再提交;会话已清则无需报错
      if (sessionRef.current === sessionId) setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAnswer(known: boolean) {
    const item = block[idx];
    if (!item || submitting) return;
    pendingRef.current.push({
      item_id: item.item_id,
      known,
      rt_ms: Math.round(performance.now() - shownAtRef.current)
    });
    setAnswered((n) => n + 1);
    if (idx + 1 < block.length) {
      setIdx(idx + 1);
      return;
    }
    void submitBlock();
  }

  function requestStart() {
    const left = MAX_TESTS - quota.used;
    if (left <= 0) {
      // 次数用尽:只能查看留存结果
      if (quota.last) {
        setResultBand(quota.last.band);
        setFresh(false);
        setScreen("result");
      }
      return;
    }
    if (quota.last) {
      setConfirm({
        title: "重新测试？",
        desc: `新结果将覆盖当前的 ${quota.last.band} 等级，以最后一次为准。剩余 ${left} 次机会。`,
        ok: "确认重测",
        action: () => void startTest()
      });
      return;
    }
    void startTest();
  }

  function requestExit() {
    setConfirm({
      title: "退出测试？",
      desc: "本次作答不会保存，也不消耗测试机会。",
      ok: "退出",
      action: () => {
        setConfirm(null);
        sessionRef.current = null;
        pendingRef.current = [];
        setScreen("welcome");
      }
    });
  }

  function goOnboarding(level?: Band) {
    router.push(level ? `/onboarding?level=${level}` : "/onboarding");
  }

  return (
    <div className="min-h-screen bg-muted px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col">
        {screen === "welcome" && (
          <WelcomeScreen
            quota={quota}
            starting={starting}
            error={startError}
            onStart={requestStart}
            onSkip={() => goOnboarding()}
          />
        )}
        {screen === "quiz" && (
          <QuizScreen
            word={block[idx]?.text ?? ""}
            answered={answered}
            submitting={submitting}
            submitError={submitError}
            showTeach={quota.used === 0 && answered === 0}
            locked={confirm !== null}
            onAnswer={handleAnswer}
            onRetry={() => void submitBlock()}
            onExit={requestExit}
          />
        )}
        {screen === "result" && resultBand && (
          <ResultScreen
            band={resultBand}
            quota={quota}
            fresh={fresh}
            onApply={() => goOnboarding(resultBand)}
            onRetest={requestStart}
          />
        )}
        {screen === "invalid" && (
          <InvalidScreen
            onRetry={() => void startTest()}
            onManual={() => goOnboarding()}
          />
        )}
      </div>

      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.title ?? ""}
        desc={confirm?.desc ?? ""}
        okLabel={confirm?.ok ?? "确认"}
        onOk={() => confirm?.action()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
