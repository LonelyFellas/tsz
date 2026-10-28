import type {
  AdminProfile,
  QuestionCandidate,
  QuestionEntryRead,
  QuestionGenerationState,
  QuestionGeneration,
  BankQuestionState,
  QuestionReviewReason
} from "@tsz/types";
import { canAdminResourceAction } from "@tsz/shared/auth";

export function canEditQuestion(
  profile: AdminProfile | null,
  createdBy: string
) {
  return canAdminResourceAction(profile, "words", "edit", createdBy);
}
export function candidateReference(
  candidate: QuestionCandidate
): QuestionEntryRead {
  return {
    candidate_ref: candidate.candidate_ref,
    source: candidate.source,
    answer_profile: candidate.answer_profile
  };
}
export const generationLabels: Record<QuestionGenerationState, string> = {
  queued: "等待生成",
  running: "正在生成",
  succeeded: "已生成草稿",
  failed: "生成失败",
  cancelled: "已取消",
  insufficient_candidates: "库内候选不足"
};
export function generationReason(generation: QuestionGeneration) {
  if (generation.reasons.length) return generation.reasons.join("；");
  switch (generation.error_code) {
    case "agent_retry_pending":
      return "生成服务暂时不可用，正在自动重试；也可以取消本次生成。";
    case "authorization_or_source_changed":
      return "词义来源或操作权限已变化，请重新选择有效词义。";
    case "source_or_question_invalid":
      return "生成结果未通过词库来源或题目检查，请调整词义或等级后重新生成。";
    default:
      return generation.state === "failed"
        ? "生成未完成，请稍后重新发起；原词义保持不变。"
        : "";
  }
}
export const questionLabels: Record<BankQuestionState, string> = {
  draft: "待审核",
  approved: "已通过",
  rejected: "已退回",
  disabled: "已停用"
};
export const reviewReasonOptions: {
  value: QuestionReviewReason;
  label: string;
}[] = [
  { value: "ambiguous", label: "答案有歧义" },
  { value: "weak_distractor", label: "干扰项不足" },
  { value: "level_mismatch", label: "难度不匹配" },
  { value: "source_error", label: "来源有误" },
  { value: "prompt_unclear", label: "题干不清楚" },
  { value: "explanation_error", label: "解析有误" },
  { value: "other", label: "其他" }
];
