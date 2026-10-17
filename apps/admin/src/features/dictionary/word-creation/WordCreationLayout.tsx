import {
  Button as MuiButton,
  Typography as MuiTypography
} from "@mui/material";
import LeftOutlined from "@mui/icons-material/ArrowBack";
import UnorderedListOutlined from "@mui/icons-material/FormatListBulleted";
import {
  Breadcrumbs,
  Stepper,
  Step,
  StepButton,
  Stack,
  Typography
} from "@mui/material";
import { AdminDrawer } from "@/components/AdminDrawer";
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
  basics: "创建词汇",
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
  const currentIndex = WORD_STEP_ORDER.indexOf(currentStep);
  const isBasicsStep = currentStep === "basics";
  const completed = new Set(presentation.completedSteps);
  const steps = WORD_STEP_ORDER.map((step) => ({
    title: WORD_STEP_TITLE[step],
    content: STEP_SUBTITLE[step],
    // 只认后端记的 completed_steps。原先「排在当前步之前就算完成」是靠顺序门禁
    // 兜底才成立的；门禁取消后可以越步进入，再用位置推断会把没做完的步骤画成绿勾。
    status:
      currentStep === step
        ? ("process" as const)
        : completed.has(step)
          ? ("finish" as const)
          : ("wait" as const),
    // 只有「草稿还没创建」才禁用：完成度不再决定导航权限，四步随时可进。
    disabled:
      !presentation.wordExists ||
      Boolean(readOnly) ||
      Boolean(reachableSteps && !reachableSteps.has(step))
  }));

  const progressTriggerLabel = presentation.progressBadge
    ? `完成情况 ${presentation.progressBadge}`
    : "完成情况";

  return (
    <div className="word-creation-page" ref={pageRef}>
      <Breadcrumbs className="word-creation-breadcrumb" aria-label="页面路径">
        <span>词库管理</span>
        <Link to="/words">智能词库</Link>
        <span>{presentation.breadcrumbTitle}</span>
      </Breadcrumbs>
      <section className="word-creation-stepper">
        <Stepper
          className="word-creation-steps"
          activeStep={currentIndex}
          nonLinear
        >
          {steps.map((step, index) => (
            <Step
              data-wizard-step
              aria-disabled={step.disabled}
              data-step-status={step.status}
              key={WORD_STEP_ORDER[index]}
              completed={step.status === "finish"}
              disabled={step.disabled}
            >
              <StepButton
                onClick={() => onStepChange?.(WORD_STEP_ORDER[index]!)}
                aria-current={index === currentIndex ? "step" : undefined}
              >
                <Stack alignItems="flex-start">
                  <Typography fontWeight={600}>{step.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {step.content}
                  </Typography>
                </Stack>
              </StepButton>
            </Step>
          ))}
        </Stepper>
      </section>

      <div className="word-creation-shell">
        <section className="word-creation-summary" aria-label="词条摘要">
          <MuiButton
            onClick={() => navigate("/words")}
            className="word-creation-back"
            variant={"text"}
            startIcon={<LeftOutlined fontSize="inherit" />}
          >
            返回智能词库
          </MuiButton>

          {presentation.showEntrySummary !== false && (
            <div className="word-summary-entry-card">
              <MuiTypography
                className="word-summary-kicker"
                component="span"
                color="text.secondary"
              >
                当前词条
              </MuiTypography>
              {presentation.summaryHeadword}

              <div className="word-summary-language">
                <MuiTypography component="span" color="text.secondary">
                  所属语言
                </MuiTypography>
                <strong>English</strong>
              </div>

              {presentation.status}
            </div>
          )}

          {narrowProgress ? (
            <MuiButton
              // 窄屏完成情况入口显式提供完整的可访问名称。
              aria-label={progressTriggerLabel}
              className="word-summary-progress-trigger"
              onClick={() => setProgressOpen(true)}
              startIcon={<UnorderedListOutlined fontSize="inherit" />}
            >
              {progressTriggerLabel}
            </MuiButton>
          ) : (
            <>
              <div className="word-summary-progress-title">
                <MuiTypography
                  className="word-summary-kicker"
                  component="span"
                  color="text.secondary"
                >
                  完成情况
                </MuiTypography>
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

      {narrowProgress && progressOpen && (
        <AdminDrawer
          title="完成情况"
          width={360}
          onClose={() => setProgressOpen(false)}
        >
          <div className="word-creation-progress-drawer">
            {presentation.progress}
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}
