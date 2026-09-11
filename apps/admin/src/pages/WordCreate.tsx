import { useQueryClient } from "@tanstack/react-query";
import { Typography } from "antd";
import { wordKeys } from "@/features/dictionary/api";
import { useNavigate } from "react-router-dom";
import {
  UnifiedCreateEntryStep,
  type UnifiedCreateRequests
} from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";
import { WordCreationLayout } from "@/features/dictionary/word-creation/WordCreationLayout";
import { V3ProductProgressList } from "@/features/dictionary/word-creation-v3/components/V3ProductProgressList";
import {
  buildV3ProductProgress,
  v3ProductProgressBadge
} from "@/features/dictionary/word-creation-v3/readiness";

// 草稿还没创建，清单只能是一份空的。用向导同一个构造器出行，创建页与进入向导后
// 看到的条目口径才一致——手写一份静态清单迟早和向导的口径漂开。
const EMPTY_PROGRESS_ROWS = buildV3ProductProgress({
  wordId: "",
  language: "en",
  completedSteps: [],
  forms: { pos: [] },
  meanings: { sense_groups: [], pos: [] }
});

export function WordCreatePage({
  requests
}: {
  requests?: UnifiedCreateRequests;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <WordCreationLayout
      currentStep="basics"
      presentation={{
        wordExists: false,
        breadcrumbTitle: "创建词条",
        completedSteps: [],
        summaryHeadword: (
          <Typography.Text className="word-summary-pending-detection">
            待检测
          </Typography.Text>
        ),
        progressBadge: v3ProductProgressBadge(EMPTY_PROGRESS_ROWS),
        progress: (
          <V3ProductProgressList
            currentKey="dialect"
            rows={EMPTY_PROGRESS_ROWS.map((row) => ({
              ...row,
              value: row.value ?? row.count
            }))}
          />
        )
      }}
    >
      <UnifiedCreateEntryStep
        requests={requests}
        onCreated={(word, state) => {
          void queryClient.invalidateQueries({ queryKey: wordKeys.all });
          navigate(`/words/${word.id}/v3/wizard/forms`, {
            replace: true,
            state
          });
        }}
      />
    </WordCreationLayout>
  );
}
