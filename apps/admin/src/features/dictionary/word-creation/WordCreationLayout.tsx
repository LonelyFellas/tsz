import { CheckIcon, ChevronLeftIcon, ListIcon } from "lucide-react";
import { Breadcrumb, Button, Typography } from "@tsz/ui/admin/display";
import { useAdminDisabled } from "@tsz/ui/admin/context";
import { Drawer } from "@tsz/ui/admin/overlays";
import type { WordCreationStep } from "@tsz/types";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Link, useNavigate } from "react-router-dom";
import "./word-creation.css";

const WORD_STEP_ORDER = ["basics", "forms", "meanings", "preview"] as const;

const WORD_STEP_TITLE: Record<WordCreationStep, string> = {
  basics: "创建词条",
  forms: "词形与发音",
  meanings: "词义与例句",
  preview: "预览并生效"
};

interface Props {
  currentStep: WordCreationStep;
  reachableSteps?: ReadonlySet<WordCreationStep>;
  readOnly?: boolean;
  onStepChange?: (step: WordCreationStep) => void;
  presentation: {
    wordExists: boolean;
    breadcrumbTitle: ReactNode;
    completedSteps: readonly WordCreationStep[];
    summaryHeadword?: ReactNode;
    showEntrySummary?: boolean;
    status?: ReactNode;
    progress: ReactNode;
    /** 窄屏抽屉入口上的完成计数(如 "1/7")。不传就只显示「完成情况」。 */
    progressBadge?: string;
  };
  children: ReactNode;
}

// 与 word-creation.css 里 `@container word-creation-page` 的窄屏断点同值：
// 超过这个宽度左栏才排得下，窄于它「完成情况」改走抽屉。
const PROGRESS_DRAWER_MAX_WIDTH = 1199;

const STEP_SUBTITLE: Record<WordCreationStep, string> = {
  basics: "所属语言｜英美区分",
  forms: "词性分类｜词形变化",
  meanings: "多维释义｜多维例句",
  preview: "结构核对｜提交生效"
};

export function WordCreationLayout({
  currentStep,
  reachableSteps,
  readOnly,
  onStepChange,
  presentation,
  children
}: Props) {
  const navigate = useNavigate();
  // 「完成情况」是只读清单,窄屏平铺在顶部会把主内容整个挤出首屏,改收进右侧抽屉。
  // 量不到宽度时(jsdom、首帧)按宽屏渲染,免得清单被藏进一个没人点的抽屉里。
  const pageRef = useRef<HTMLDivElement>(null);
  const [narrowProgress, setNarrowProgress] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || typeof ResizeObserver === "undefined") return;
    const apply = (width: number) => {
      if (width > 0) setNarrowProgress(width <= PROGRESS_DRAWER_MAX_WIDTH);
    };
    apply(page.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    observer.observe(page);
    return () => observer.disconnect();
  }, []);
  // 拖宽窗口时抽屉留在那儿会盖住已经排得下的左栏。
  useEffect(() => {
    if (!narrowProgress) setProgressOpen(false);
  }, [narrowProgress]);
  const componentDisabled = useAdminDisabled();
  const isBasicsStep = currentStep === "basics";
  const completed = new Set(presentation.completedSteps);
  const progressTriggerLabel = presentation.progressBadge
    ? `完成情况 ${presentation.progressBadge}`
    : "完成情况";

  return (
    <div className="word-creation-page" ref={pageRef}>
      <Breadcrumb
        className="word-creation-breadcrumb"
        items={[
          { title: "词库管理" },
          {
            title: <Link to="/words">智能词库</Link>
          },
          { title: presentation.breadcrumbTitle }
        ]}
      />

      <nav className="word-creation-stepper" aria-label="词条编辑步骤">
        {WORD_STEP_ORDER.map((step, index) => {
          const current = step === currentStep;
          const finished = completed.has(step) && !current;
          const disabled =
            componentDisabled ||
            !presentation.wordExists ||
            step === "basics" ||
            readOnly ||
            (reachableSteps && !reachableSteps.has(step)) ||
            !onStepChange;
          return (
            <button
              key={step}
              type="button"
              disabled={disabled}
              aria-current={current ? "step" : undefined}
              className="word-editor-step"
              onClick={() => {
                if (!current) onStepChange?.(step);
              }}
            >
              <span className="word-editor-step-index" aria-hidden="true">
                {finished ? <CheckIcon /> : index + 1}
              </span>
              <span>
                <strong>{WORD_STEP_TITLE[step]}</strong>
                <small>{STEP_SUBTITLE[step]}</small>
              </span>
              {finished && <span className="sr-only">已完成</span>}
            </button>
          );
        })}
      </nav>

      <div className="word-creation-shell">
        <section className="word-creation-summary" aria-label="词条摘要">
          <Button
            type="text"
            icon={<ChevronLeftIcon />}
            onClick={() => navigate("/words")}
            className="word-creation-back"
          >
            返回智能词库
          </Button>

          {presentation.showEntrySummary !== false && (
            <div className="word-summary-entry-card">
              <Typography.Text type="secondary" className="word-summary-kicker">
                当前词条
              </Typography.Text>
              {presentation.summaryHeadword}

              <div className="word-summary-language">
                <Typography.Text type="secondary">所属语言</Typography.Text>
                <strong>English</strong>
              </div>

              {presentation.status}
            </div>
          )}

          {narrowProgress ? (
            <Button
              // 图标 会把「unordered-list」混进可及名，显式定名兜住。
              aria-label={progressTriggerLabel}
              className="word-summary-progress-trigger"
              icon={<ListIcon />}
              onClick={() => setProgressOpen(true)}
            >
              {progressTriggerLabel}
            </Button>
          ) : (
            <>
              <div className="word-summary-progress-title">
                <Typography.Text
                  type="secondary"
                  className="word-summary-kicker"
                >
                  完成情况
                </Typography.Text>
              </div>
              {presentation.progress}
            </>
          )}
        </section>

        <main
          className={`word-creation-content${isBasicsStep ? " word-creation-content--basics" : ""}`}
        >
          {children}
        </main>
      </div>

      {narrowProgress && (
        <Drawer
          classNames={{ body: "word-creation-progress-drawer" }}
          onClose={() => setProgressOpen(false)}
          open={progressOpen}
          placement="right"
          size="min(360px, 86vw)"
          title="完成情况"
        >
          {presentation.progress}
        </Drawer>
      )}
    </div>
  );
}
