import {
  useWorkspaceTranslation,
  type WorkspaceMessage
} from "@/features/dictionary/i18n/workspace";
import { CheckIcon, ChevronLeftIcon } from "lucide-react";
import { Breadcrumb, Button, Typography } from "@tsz/ui/admin/display";
import { useAdminDisabled } from "@tsz/ui/admin/context";
import { FloatingEntryOverview } from "./FloatingEntryOverview";
import type { WordCreationStep } from "@tsz/types";
import { useRef, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./word-creation.css";

const WORD_STEP_ORDER = ["basics", "forms", "meanings", "preview"] as const;

const WORD_STEP_TITLE: Record<WordCreationStep, WorkspaceMessage> = {
  basics: "create_entry",
  forms: "forms",
  meanings: "meanings",
  preview: "preview"
};

interface Props {
  currentStep: WordCreationStep;
  dictionary?: { path: string; label: string; back: string };
  stepLabels?: Partial<
    Record<WordCreationStep, { title: string; subtitle: string }>
  >;
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
    /** 完成情况标题上的完成计数（如 "1/7"）。 */
    progressBadge?: string;
  };
  children: ReactNode;
}

const STEP_SUBTITLE: Record<WordCreationStep, WorkspaceMessage> = {
  basics: "basics_help",
  forms: "forms_help",
  meanings: "meanings_help",
  preview: "preview_help"
};

export function WordCreationLayout({
  currentStep,
  dictionary,
  stepLabels,
  reachableSteps,
  readOnly,
  onStepChange,
  presentation,
  children
}: Props) {
  const { t } = useWorkspaceTranslation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const componentDisabled = useAdminDisabled();
  const isBasicsStep = currentStep === "basics";
  const completed = new Set(presentation.completedSteps);

  return (
    <div className="word-creation-page" ref={pageRef}>
      <Breadcrumb
        aria-label={t("breadcrumb")}
        className="word-creation-breadcrumb"
        items={[
          { title: t("dictionary_management") },
          {
            title: (
              <Link to={dictionary?.path ?? "/words"}>
                {dictionary?.label ?? t("dictionary")}
              </Link>
            )
          },
          { title: presentation.breadcrumbTitle }
        ]}
      />

      <nav className="word-creation-stepper" aria-label={t("steps")}>
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
                <strong>
                  {stepLabels?.[step]?.title ?? t(WORD_STEP_TITLE[step])}
                </strong>
                <small>
                  {stepLabels?.[step]?.subtitle ?? t(STEP_SUBTITLE[step])}
                </small>
              </span>
              {finished && <span className="sr-only">{t("completed")}</span>}
            </button>
          );
        })}
      </nav>

      <div className="word-creation-shell">
        <FloatingEntryOverview pageRef={pageRef}>
          <section className="word-creation-summary" aria-label={t("summary")}>
            <Button
              type="text"
              icon={<ChevronLeftIcon />}
              onClick={() => navigate(dictionary?.path ?? "/words")}
              className="word-creation-back"
            >
              {dictionary?.back ?? t("back")}
            </Button>

            {presentation.showEntrySummary !== false && (
              <div className="word-summary-entry-card">
                <Typography.Text
                  type="secondary"
                  className="word-summary-kicker"
                >
                  {t("current_entry")}
                </Typography.Text>
                {presentation.summaryHeadword}

                <div className="word-summary-language">
                  <Typography.Text type="secondary">
                    {t("language")}
                  </Typography.Text>
                  <strong>English</strong>
                </div>

                {presentation.status}
              </div>
            )}

            <div className="word-summary-progress-title">
              <Typography.Text type="secondary" className="word-summary-kicker">
                {t("progress")}
              </Typography.Text>
              {presentation.progressBadge && (
                <Typography.Text type="secondary">
                  {presentation.progressBadge}
                </Typography.Text>
              )}
            </div>
            {presentation.progress}
          </section>
        </FloatingEntryOverview>

        <main
          className={`word-creation-content${isBasicsStep ? " word-creation-content--basics" : ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
