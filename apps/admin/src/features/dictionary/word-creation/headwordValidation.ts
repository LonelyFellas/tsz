// 词条主词的字符集预检。
//
// 「录入与检测」卡片上写着「仅支持英文词条」，但内置词典未命中时
// (`builtin_dictionary.status === "not_found"`) 创建路径是放行的——那个口子是留给
// 新造词、品牌名、缩写和行业术语的，中文、假名、纯数字本不在豁免之列却一起漏了过去，
// 提交后会落库成一条 `language = "en"` 的脏词条。
//
// 两个入口都要拦：录入框走 `form.validateFields()`（顺带省掉一次注定无意义的词典往返），
// 检测之后「确认英美主词」里的英/美主词框仍可自由编辑，同样能产出最终落库的 headword。

import type { WordHeadwordsV2 } from "@tsz/types";

/**
 * 允许出现在英文词条里的字符：拉丁字母、数字、半角空格与常见连接符。
 *
 * 变音符号可能以组合形式出现（`cafe` + U+0301），此时重音符自身是 `\p{Mark}` 而非
 * Latin script，故一并放行，否则 café 的分解形式会被误拦。
 *
 * 空白只认半角空格：`\s` 会连 U+3000 全角空格、U+00A0 不换行空格、换行与制表符一起放过，
 * 而全角空格恰恰是中文输入法的产物——「give　up」看着与「give up」一样，落库却是另一条记录。
 *
 * 逗号是为「day in, day out」这类短语开的——内置词典里有 663 条含逗号的正经英文词条，
 * 不放行等于把它们全挡在录入之外。
 */
const ALLOWED_HEADWORD = /^[\p{Script=Latin}\p{Mark}0-9 '’\-.&/,]+$/u;

/** 词条得有实义字母，否则「123456」「---」这类输入能从字符集检查里溜过去。 */
const HAS_LATIN_LETTER = /\p{Script=Latin}/u;

export const HEADWORD_CHARSET_MESSAGE =
  "仅支持英文词条，只能包含字母、数字、空格与 - ' . & / , 等常见符号";

export const HEADWORD_NO_LETTER_MESSAGE = "词条至少需要包含一个英文字母";

/** 返回不通过的原因文案；通过时返回 `undefined`。空值交给 `required` 规则，不在这里报。 */
export function headwordIssue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!ALLOWED_HEADWORD.test(trimmed)) return HEADWORD_CHARSET_MESSAGE;
  if (!HAS_LATIN_LETTER.test(trimmed)) return HEADWORD_NO_LETTER_MESSAGE;
  return undefined;
}

/**
 * 按方言侧给出英美主词的问题文案，供「确认英美主词」逐框标红。
 * unified 模式下两侧同源，问题只挂在英式侧展示位上没有意义，故只在 distinguish 时分侧返回。
 */
export function headwordsIssues(headwords: WordHeadwordsV2): {
  uk?: string;
  us?: string;
} {
  if (headwords.mode === "unified") {
    const issue = headwordIssue(headwords.common);
    return { uk: issue, us: issue };
  }
  return {
    uk: headwordIssue(headwords.uk),
    us: headwordIssue(headwords.us)
  };
}

/** 主词任一侧不合法就不能建草稿——录入框拦不住检测之后的手工改写。 */
export function hasHeadwordsIssue(headwords: WordHeadwordsV2): boolean {
  const issues = headwordsIssues(headwords);
  return issues.uk !== undefined || issues.us !== undefined;
}
