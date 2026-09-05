import {
  HttpError,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError
} from "@tsz/api-client";
import type { V3DraftValidationIssue, V3ValidationIssueCode } from "@tsz/types";

const UNKNOWN_ISSUE_MESSAGE = "该内容暂时无法完成，请刷新后重试";

const ISSUE_MESSAGES = {
  invalid_regional_variant_shape: "词形的英美结构与当前规则不一致",
  dialect_rules_invalid: "英美拼写与音标规则组合无效",
  invalid_form_type_for_part_of_speech: "当前词性不支持该词形类型",
  forbidden_v3_field: "词条包含当前版本不支持的内容",
  duplicate_node_id: "词条内容存在重复标识，请刷新后重试",
  duplicate_pos_code: "同一词条不能重复添加相同词性",
  pos_required: "请至少添加一个词性",
  form_group_membership_invalid: "词形变化组中的词形引用无效",
  orphan_form: "每个词形都必须加入至少一个词形变化组",
  form_group_required: "每个词性都需要至少一个词形变化组",
  empty_form_group: "词形变化组不能为空",
  base_form_required_in_group: "每组词形变化都需要一个原形",
  variant_spelling_required: "请填写词形拼写",
  pronunciation_required: "请完整填写发音方式、字典音标和实际发音",
  duplicate_pronunciation: "同一词形下不能添加重复发音",
  content_limit_exceeded: "词条内容数量超过上限，请精简后重试",
  sense_group_required: "请至少添加一个语义区间",
  sense_group_name_required: "请填写语义区间名称",
  sense_group_name_too_long: "语义区间名称过长",
  pos_not_found: "词义关联的词性不存在，请刷新后重试",
  duplicate_pos_meanings: "同一词性不能重复录入词义",
  grammar_required: "请至少添加一个语法结构",
  grammar_variants_invalid: "请完整填写当前方言的语法结构",
  sense_required: "请至少添加一条词义",
  level_invalid: "请选择有效的词义等级",
  sub_pos_required: "请选择细分词性",
  invalid_sub_part_of_speech: "细分词性与当前基本词性不匹配",
  frequency_invalid: "词频必须为 0–100，且最多保留两位小数",
  sense_group_not_found: "词义关联的语义区间不存在",
  definition_required: "请至少添加一条释义",
  definition_level_invalid: "请选择有效的释义等级",
  definition_invalid: "请完整填写释义并选择语法结构",
  native_definition_required: "请至少填写一条中文释义",
  sentence_level_invalid: "请选择有效的例句等级",
  sentence_incomplete: "请完整填写中英文例句并关联当前词义",
  sentence_translation_required: "请填写当前等级的中文译文",
  sentence_translation_invalid: "中文译文格式无效或超过三档",
  duplicate_sentence_translation_band: "同一译文等级只能添加一次",
  sentence_link_role_invalid: "例句关联类型无效",
  duplicate_sentence_link: "例句中存在重复关联",
  relation_score_invalid: "关系词相关度必须在有效范围内",
  relation_type_invalid: "关系词类型无效",
  relation_self_target: "关系词不能指向当前词义本身",
  relation_target_archived: "关系词目标在垃圾桶中，请重新选择",
  relation_target_has_no_sense: "关系词目标没有可用词义",
  relation_target_unavailable: "关系词目标当前不可用",
  relation_target_stale: "关系词目标已变化，请重新选择",
  sentence_context_target_unavailable: "例句关联目标当前不可用",
  relation_pending_headword_invalid: "待关联词条名称无效",
  relation_target_shape_invalid: "关联词目标信息不完整，请重新选择",
  relation_pending_gloss_without_headword: "请先填写待关联词条名称",
  relation_pending_gloss_invalid: "预定义词义不能超过 5000 个字符",
  relation_pending_gloss_conflict: "同一待建关联词不能填写不同的预定义词义",
  relation_pending_gloss_target_exists: "同名词条已存在，请选择已有词义",
  relation_prebound_target_not_found: "已选择的关联词草稿不存在，请重新搜索",
  relation_prebound_target_archived: "关联词目标已归档，请先恢复或重新选择",
  relation_prebound_target_has_no_sense:
    "关联词目标还没有词义，请先补充第一词义",
  relation_target_sense_deleted: "原关联词义已删除，请显式重选词义或删除关联",
  node_id_reused: "内容标识已被使用，请刷新后重试",
  node_binding_unknown: "内容来源无法确认，请刷新后重试",
  node_binding_changed: "内容结构已变化，请刷新后重试",
  meanings_storage_unsafe: "词义内容暂时无法安全保存，请刷新后重试",
  pos_meanings_required: "每个词性都需要填写词义",
  sense_has_inbound_publication_refs: "该词义已被发布内容引用，暂时不能移除",
  phrase_component_not_allowed: "只有短语词条可以设置成分用词",
  phrase_component_limit_exceeded: "单条释义最多设置 100 个成分用词",
  phrase_component_literal_invalid: "成分用词的词面不合法，请重新选词",
  phrase_component_self_target: "成分用词不能关联短语自己",
  phrase_component_target_unavailable: "成分用词关联的词条已不可用，请重新选择",
  phrase_component_target_nested: "关联的短语自身含成分用词，只能再套一层",
  phrase_component_target_stale: "关联的词条内容已变化，请重新选择",
  voice_profile_invalid:
    "音色或语速设置不合法，请重新选择音色并把语速调回 0.50×–2.00×"
} satisfies Record<V3ValidationIssueCode, string>;

export function v3IssueMessage(issue: V3DraftValidationIssue): string {
  return ISSUE_MESSAGES[issue.code] ?? UNKNOWN_ISSUE_MESSAGE;
}

export function v3IssueMessages(
  issues: readonly V3DraftValidationIssue[]
): string[] {
  return [...new Set(issues.map(v3IssueMessage))];
}

export interface V3DetailErrorPresentation {
  title: string;
  description: string;
  retryable: boolean;
}

export function presentV3DetailError(
  error: unknown
): V3DetailErrorPresentation {
  const title = "无法打开词条";
  if (error instanceof UnsupportedAdminWordSchemaVersionError) {
    return {
      title,
      description: "当前前端不支持该词条数据版本，请升级后重试",
      retryable: false
    };
  }
  if (error instanceof InvalidAdminWordResponseError) {
    return {
      title,
      description: "词条响应格式异常，已安全停止",
      retryable: false
    };
  }
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return {
        title,
        description: "登录状态已失效，请重新登录",
        retryable: false
      };
    }
    if (error.status === 403) {
      return {
        title,
        description: "当前账号没有查看该词条的权限",
        retryable: false
      };
    }
    if (error.status === 404 || error.code === "word_not_found") {
      return { title, description: "词条不存在或已被删除", retryable: false };
    }
    if (error.status === 422 && error.code === "unsupported_schema_version") {
      return {
        title,
        description: "当前前端不支持该词条数据版本，请升级后重试",
        retryable: false
      };
    }
    if (error.status === 503) {
      return {
        title,
        description: "词条服务暂时不可用，请稍后重试",
        retryable: true
      };
    }
    if (error.status >= 500) {
      return {
        title,
        description: "词条加载失败，请稍后重试",
        retryable: true
      };
    }
    return { title, description: "词条暂时无法打开", retryable: false };
  }
  if (error instanceof TypeError) {
    return {
      title,
      description: "网络异常，请检查连接后重试",
      retryable: true
    };
  }
  return { title, description: "词条暂时无法打开", retryable: false };
}

export function shouldRetryV3Detail(
  failureCount: number,
  error: unknown
): boolean {
  return failureCount < 2 && presentV3DetailError(error).retryable;
}
