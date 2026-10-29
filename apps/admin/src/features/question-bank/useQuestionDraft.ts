import { useEffect, useRef, useState } from "react";
import { App, Form } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdminProfile,
  BankQuestion,
  QuestionInspection,
  ReviewBankQuestion
} from "@tsz/types";
import { api } from "@/lib/auth";
import {
  candidateReference,
  canEditQuestion,
  canReviewQuestion,
  questionLabels
} from "./model";

export interface DraftFields {
  prompt: string;
  explanation: string;
  option_explanations: string[];
}
export interface QuestionDraftOptions {
  initial: BankQuestion;
  profile: AdminProfile;
  onDirtyChange: (dirty: boolean) => void;
  onQuestionChange?: (question: BankQuestion) => void;
  onDecision?: (question: BankQuestion) => void;
}

/** Mutation lifecycle for editing, review and explicit server-version restoration. */
export function useQuestionDraft({
  initial,
  profile,
  onDirtyChange,
  onQuestionChange,
  onDecision
}: QuestionDraftOptions) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [question, setQuestion] = useState(initial);
  const [options, setOptions] = useState(
    initial.content.options.map((o) => o.candidate)
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [form] = Form.useForm<DraftFields>();
  const [reviewForm] =
    Form.useForm<Pick<ReviewBankQuestion, "reason_codes" | "comment">>();
  const writable = canEditQuestion(profile, question.created_by);
  const reviewable = canReviewQuestion(profile, question.created_by);
  const editable = writable && question.state !== "approved";
  function markDirty() {
    setDirty(true);
    onDirtyChange(true);
  }
  async function accept(result: BankQuestion, validated = false) {
    client.setQueryData(
      ["question-bank", profile.id, "question", result.id],
      result
    );
    if (validated) {
      client.setQueryData<QuestionInspection>(
        ["question-bank", profile.id, "inspection", result.id],
        (previous) => ({
          question: result,
          target_current: true,
          semantic_review: previous?.semantic_review ?? null,
          // Saving a draft is not a new semantic review. The server rechecks applicability.
          semantic_review_current: false,
          sources: result.content.options.map((o) => ({
            option_id: o.option_id,
            current: true
          }))
        })
      );
    }
    if (mounted.current) {
      setError("");
      setQuestion(result);
      setOptions(result.content.options.map((o) => o.candidate));
      form.setFieldsValue({
        prompt: result.content.prompt,
        explanation: result.content.explanation,
        option_explanations: result.content.options.map((o) => o.explanation)
      });
      setDirty(false);
      onDirtyChange(false);
      onQuestionChange?.(result);
    }
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["question-bank", profile.id, "questions"]
      }),
      client.invalidateQueries({
        queryKey: ["question-bank", profile.id, "workbench"]
      }),
      client.invalidateQueries({
        queryKey: ["question-bank", profile.id, "inspection", result.id]
      })
    ]);
  }
  async function save(values: DraftFields) {
    if (!editable || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.edit(question.id, {
        expected_revision: question.revision,
        ...values,
        options: options.map(candidateReference)
      });
      await accept(result, true);
      if (mounted.current) message.success("草稿已保存，请确认后审核。");
      return true;
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "保存失败，修改已保留。"
        );
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function review(
    decision: ReviewBankQuestion["decision"],
    approveWithoutComment = false
  ) {
    if (!reviewable || dirty || inFlight.current) return;
    const values =
      decision === "approve" && approveWithoutComment
        ? { reason_codes: [], comment: "" }
        : await reviewForm.validateFields();
    if (!mounted.current || inFlight.current) return;
    if (decision !== "approve" && !values.reason_codes?.length) {
      reviewForm.setFields([
        { name: "reason_codes", errors: ["请选择退回或停用的原因。"] }
      ]);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.review(question.id, {
        expected_revision: question.revision,
        decision,
        reason_codes: values.reason_codes ?? [],
        comment: values.comment?.trim() ?? ""
      });
      await accept(result, decision === "approve");
      if (mounted.current) {
        message.success(`题目${questionLabels[result.state]}`);
        onDecision?.(result);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "审核失败，意见已保留。"
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    question,
    options,
    setOptions,
    dirty,
    error,
    busy,
    writable,
    reviewable,
    editable,
    form,
    reviewForm,
    markDirty,
    accept,
    save,
    review
  };
}
