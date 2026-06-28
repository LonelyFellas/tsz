// 词库与词表 —— 平台管理智能词库,师生创建词表。

/** 审核状态:对应流程图「敏感词审核 / 是否通过审核」。 */
export type ReviewStatus = "pending" | "approved" | "rejected";

/** 智能词库里的单词(平台维护)。 */
export interface Word {
  id: string;
  text: string;
  /** 单词内容:释义、例句、音标等 */
  definition?: string;
  phonetic?: string;
  example?: string;
  created_at: string;
}

/** 词表可见性:私密 / 公开(公开需过审)。 */
export type WordListVisibility = "private" | "public";

export interface WordList {
  id: string;
  name: string;
  owner_id: string;
  /** 来源:平台智能词库选词 + 自定义词汇 */
  word_ids: string[];
  custom_words: WordListCustomWord[];
  visibility: WordListVisibility;
  /** 公开词表的审核状态 */
  review_status?: ReviewStatus;
  reject_reason?: string;
  created_at: string;
}

/** 用户自定义词汇(对应「是否有自定义词汇」分支,需敏感词审核)。 */
export interface WordListCustomWord {
  text: string;
  definition?: string;
}

/** 对单词/词表的评论(需敏感词审核)。 */
export interface Comment {
  id: string;
  author_id: string;
  /** 评论目标:单词或词表 */
  target_type: "word" | "wordlist";
  target_id: string;
  content: string;
  review_status: ReviewStatus;
  created_at: string;
}
