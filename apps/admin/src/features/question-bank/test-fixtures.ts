import type { AdminProfile, BankQuestion, QuestionCandidate } from "@tsz/types";
export const profile = {
  id: "author",
  role: "admin",
  permissions: ["words.access", "words.edit", "words.publish"]
} as AdminProfile;
export function candidate(spelling: string): QuestionCandidate {
  return {
    candidate_ref: spelling,
    source: {
      entry_id: spelling,
      publication_id: `${spelling}-published`,
      sense_id: `${spelling}-sense`,
      definition_id: `${spelling}-definition`,
      pos_id: "noun",
      form_id: `${spelling}-form`
    },
    content_fingerprint: spelling,
    spelling,
    part_of_speech: "n.",
    level: "A1",
    definition: `${spelling} 的释义`,
    other_definitions: [],
    accepted_spellings: [spelling],
    answer_profile: "BrE",
    form_type: "base",
    teaching_eligible: true
  };
}
export const target = candidate("apple");
export const content = {
  target,
  prompt: "苹果",
  question_level: "B1",
  answer_profile: "BrE",
  options: ["apple", "banana", "pear", "orange"].map((word, index) => ({
    option_id: String.fromCharCode(65 + index),
    candidate: candidate(word),
    explanation: `${word} 理由`
  })),
  correct_option_id: "A",
  explanation: "苹果对应 apple。",
  concerns: ["请核查干扰项语义。"]
};
export const question: BankQuestion = {
  id: "question",
  generation_id: "generation",
  revision: 3,
  state: "draft",
  content,
  original_content: content,
  created_by: "author",
  reviewed_by: null,
  review_comment: "",
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:00:00Z"
};
