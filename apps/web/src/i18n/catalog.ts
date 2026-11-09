import { ClientResponseError, RequestTimeoutError } from "@tsz/api-client";
import type { createInterfaceI18n } from "@tsz/shared/i18n";
type i18n = ReturnType<typeof createInterfaceI18n>;
import type { InterfaceResourceBundles } from "@tsz/shared/i18n";

export type WebMessages = Record<string, readonly [string, string, string]>;
export type OriginalText = { readonly original: string };
export const originalText = (original: string): OriginalText => ({ original });
export type LocalText = {
  readonly source: string;
  readonly values: WebValues;
};
export type WebValues = Record<
  string,
  string | number | null | undefined | LocalText
>;
export type WebNotice = string | OriginalText | LocalText;
export const localText = (
  source: string,
  values: LocalText["values"]
): LocalText => ({ source, values });
export class LocalWebError extends Error {}
export const webErrorText = (error: unknown, fallback: string): WebNotice =>
  error instanceof ClientResponseError
    ? "数据暂不可用，请刷新后重试"
    : error instanceof LocalWebError || error instanceof RequestTimeoutError
      ? error.message
      : error instanceof Error
        ? originalText(error.message)
        : fallback;
export const noticeSource = (value: WebNotice): string =>
  typeof value === "string"
    ? value
    : "original" in value
      ? value.original
      : value.source;
export type WebText = (
  source: WebNotice | null | undefined,
  values?: WebValues
) => string;

export interface WebCatalog {
  namespace: string;
  messages: WebMessages;
  plurals: Partial<Record<string, { parameter: string; one: string }>>;
  keys: Map<string, string>;
  resources: InterfaceResourceBundles;
}

/** 只接收界面作者提供的文案；业务正文与服务端原文不送入查找。 */
export function defineWebMessages<N extends string, M extends WebMessages>(
  namespace: N,
  messages: M,
  american: Partial<Record<keyof M, string>> = {},
  plurals: Partial<Record<keyof M, { parameter: string; one: string }>> = {}
): WebCatalog {
  const column = (index: 0 | 1 | 2) =>
    Object.fromEntries(
      Object.entries(messages).map(([key, row]) => [key, row[index]])
    );
  const english = column(2);
  const regional: Record<string, string> = {};
  for (const [key, value] of Object.entries(american))
    if (typeof value === "string") regional[key] = value;
  for (const [key, value] of Object.entries(plurals)) {
    if (!value) continue;
    english[`${key}_one`] = value.one;
    english[`${key}_other`] = messages[key]![2];
    if (regional[key]) {
      regional[`${key}_one`] = value.one;
      regional[`${key}_other`] = regional[key];
    }
  }
  return {
    namespace,
    messages,
    plurals,
    keys: new Map(Object.entries(messages).map(([key, row]) => [row[0], key])),
    resources: {
      "zh-Hans": { [namespace]: column(0) },
      "zh-Hant": { [namespace]: column(1) },
      en: { [namespace]: english },
      "en-US": { [namespace]: regional }
    }
  };
}

export function addWebCatalog(instance: i18n, catalog: WebCatalog) {
  for (const [language, namespaces] of Object.entries(catalog.resources)) {
    if (!instance.hasResourceBundle(language, catalog.namespace))
      instance.addResourceBundle(
        language,
        catalog.namespace,
        structuredClone(namespaces[catalog.namespace])
      );
  }
}

export const webCommon = /* @__PURE__ */ defineWebMessages("webCommon", {
  teacher_unverified: [
    "暂时无法核验教师资格，请重试",
    "暫時無法核驗教師資格，請重試",
    "Could not verify your teacher qualification. Try again."
  ],
  teacher_unapproved: [
    "当前账号尚未通过教师认证",
    "目前帳號尚未通過教師認證",
    "This account has not passed teacher certification"
  ],
  workspace_storage: [
    "无法保存工作台偏好，请检查浏览器存储设置后重试",
    "無法儲存工作臺偏好，請檢查瀏覽器儲存設定後重試",
    "Could not save workspace preferences. Check browser storage settings and try again."
  ],
  user: ["用户", "使用者", "User"],
  feature_unavailable: [
    "该功能暂未开放，敬请期待",
    "此功能尚未開放",
    "This feature is not available yet."
  ],
  request_timeout: [
    "请求超时，请重试",
    "請求逾時，請重試",
    "The request timed out. Try again."
  ],
  request_timeout_unknown: [
    "请求超时，操作结果尚未确认，请先刷新查看结果",
    "請求逾時，操作結果尚未確認，請先重新整理查看結果",
    "The request timed out and the result is unconfirmed. Reload to check it first."
  ],
  response_unavailable: [
    "数据暂不可用，请刷新后重试",
    "資料暫時無法使用，請重新整理後再試",
    "Data are unavailable. Reload and try again."
  ],
  password_required: ["请输入密码", "請輸入密碼", "Enter your password"],
  password_short: [
    "密码至少需要 15 个字符",
    "密碼至少需要15個字元",
    "Use at least 15 characters for your password"
  ],
  password_long: [
    "密码不能超过 128 个字符",
    "密碼不能超過128個字元",
    "Your password must not exceed 128 characters"
  ],
  password_weak: [
    "该密码过于常见或容易猜测，请换一个",
    "此密碼過於常見或容易猜測，請更換",
    "This password is too common or easy to guess. Choose another."
  ],
  password_compromised: [
    "该密码已出现在泄露记录中，请换一个",
    "此密碼已出現在外洩紀錄中，請更換",
    "This password has appeared in a data breach. Choose another."
  ],
  password_unchanged: [
    "新密码不能与当前密码相同",
    "新密碼不能與目前密碼相同",
    "The new password must differ from the current password"
  ],
  session_expired: [
    "登录已过期，请重新登录",
    "登入已過期，請重新登入",
    "Your session has expired. Sign in again."
  ],
  hide_field: ["隐藏{{label}}", "隱藏{{label}}", "Hide {{label}}"],
  show_field: ["显示{{label}}", "顯示{{label}}", "Show {{label}}"],
  new_contact: ["新{{channel}}", "新{{channel}}", "New {{channel}}"],
  contact_code: [
    "{{channel}}验证码",
    "{{channel}}驗證碼",
    "Verification code for {{channel}}"
  ],
  bind_contact: ["绑定{{channel}}", "綁定{{channel}}", "Bind {{channel}}"],
  change_contact: ["换绑{{channel}}", "更換{{channel}}", "Change {{channel}}"],
  unbind_contact: [
    "解绑{{channel}}",
    "解除綁定{{channel}}",
    "Unbind {{channel}}"
  ],
  shared_use_at_least_v0_characters_for_your_password: [
    "密码至少 {{v0}} 位",
    "密碼至少 {{v0}} 位",
    "Use at least {{v0}} characters for your password"
  ],
  shared_network_error_try_again_later: [
    "网络异常，请稍后重试",
    "網路異常，請稍後重試",
    "Network error. Try again later."
  ],
  shared_incorrect_or_expired_code_request_all_required_codes_again: [
    "验证码错误或已失效，请重新获取所需的全部验证码",
    "驗證碼錯誤或已失效，請重新獲取所需的全部驗證碼",
    "Incorrect or expired code. Request all required codes again."
  ],
  shared_contact_details_are_invalid_unbound_or_unchanged_check_and_try_again: [
    "联系方式无效、尚未绑定或与当前联系方式相同，请检查后重试",
    "聯絡方式無效、尚未繫結或與當前聯絡方式相同，請檢查後重試",
    "Contact details are invalid, unbound or unchanged. Check and try again."
  ],
  shared_the_password_service_is_unavailable_try_again_later: [
    "密码服务暂不可用，请稍后再试",
    "密碼服務暫時無法使用，請稍後重試",
    "The password service is unavailable. Try again later."
  ],
  shared_incorrect_current_password_try_again: [
    "当前密码错误，请重试",
    "當前密碼錯誤，請重試",
    "Incorrect current password. Try again."
  ],
  shared_your_session_expired_sign_in_again_to_continue: [
    "登录已失效，请重新登录后操作",
    "登入已失效，請重新登入後操作",
    "Your session expired. Sign in again to continue."
  ],
  shared_this_contact_method_is_used_by_another_account: [
    "该联系方式已被其他账号使用",
    "該聯絡方式已被其他賬號使用",
    "This contact method is used by another account"
  ],
  shared_too_many_sign_in_attempts_try_again_later: [
    "登录尝试过于频繁，请稍后再试",
    "登入嘗試過於頻繁，請稍後再試",
    "Too many sign-in attempts. Try again later."
  ],
  shared_sign_in_is_unavailable_try_again_later: [
    "登录服务暂不可用，请稍后再试",
    "登入服務暫不可用，請稍後再試",
    "Sign-in is unavailable. Try again later."
  ],
  shared_too_many_code_requests_try_again_later: [
    "验证码发送过于频繁，请稍后再试",
    "驗證碼傳送過於頻繁，請稍後再試",
    "Too many code requests. Try again later."
  ],
  shared_verification_codes_are_unavailable_try_again_later_3: [
    "验证码服务暂不可用，请稍后再试",
    "驗證碼服務暫不可用，請稍後再試",
    "Verification codes are unavailable. Try again later."
  ],
  shared_use_15_128_characters_case_sensitive_symbols_and_spaces_allowed: [
    "密码须为 15–128 个字符，区分大小写，支持符号和空格",
    "密碼須為 15–128 個字元，區分大小寫，支援符號和空格",
    "Use 15–128 characters; case-sensitive; symbols and spaces allowed"
  ],
  shared_this_account_is_disabled_contact_support_2: [
    "账号已停用，请联系平台客服",
    "賬號已停用，請聯絡平臺客服",
    "This account is disabled. Contact support."
  ],
  shared_you_cannot_remove_your_last_sign_in_method: [
    "不能移除最后一种登录方式",
    "不能移除最後一種登入方式",
    "You cannot remove your last sign-in method"
  ],
  shared_verify_and_bind_a_phone_number_first: [
    "请先验证并绑定手机号",
    "請先驗證並繫結手機號",
    "Verify and bind a phone number first"
  ],
  shared_a_phone_number_cannot_be_unbound_use_change_phone_number_instead: [
    "手机号不能解绑，请使用换绑手机号",
    "手機號不能解綁，請使用換綁手機號",
    "A phone number cannot be unbound. Use “Change phone number” instead."
  ],
  shared_your_account_details_have_changed_reload_and_try_again: [
    "账号信息已变化，请刷新页面后重试",
    "賬號資訊已變化，請重新整理頁面後重試",
    "Your account details have changed. Reload and try again."
  ],
  shared_15_128_characters_case_sensitive_symbols_and_spaces_allowed: [
    "15–128 个字符，区分大小写，支持符号和空格",
    "15–128 個字元，區分大小寫，支援符號和空格",
    "15–128 characters; case-sensitive; symbols and spaces allowed"
  ],
  shared_use_1_50_characters_for_your_nickname: [
    "昵称需为 1–50 个字符",
    "暱稱需為 1–50 個字元",
    "Use 1–50 characters for your nickname"
  ],
  shared_your_nickname_must_not_exceed_50_characters: [
    "昵称不能超过 50 个字符",
    "暱稱不能超過 50 個字元",
    "Your nickname must not exceed 50 characters"
  ],
  shared_your_nickname_cannot_contain_or_invisible_characters: [
    "昵称不能包含 < > 或不可见字符",
    "暱稱不能包含 < > 或不可見字元",
    "Your nickname cannot contain <, > or invisible characters"
  ],
  shared_british: ["英式", "英式", "British"],
  shared_american: ["美式", "美式", "American"]
} as const);

export function webText(instance: i18n, catalog: WebCatalog): WebText {
  return (source, values) => {
    if (source == null) return "";
    if (typeof source !== "string") {
      if ("original" in source) return source.original;
      values = source.values;
      source = source.source;
    }
    const selected = catalog.keys.has(source) ? catalog : webCommon;
    const key = selected.keys.get(source);
    if (!key) return source;
    // 命名空间由本模块静态登记，键来自受控目录。
    return String(
      instance.t(key as never, {
        ns: selected.namespace as never,
        ...(selected.plurals[key]
          ? { count: Number(values?.[selected.plurals[key].parameter]) }
          : {}),
        ...Object.fromEntries(
          Object.entries(values ?? {}).map(([key, value]) => [
            key,
            typeof value === "object" && value !== null
              ? webText(instance, catalog)(value)
              : value == null
                ? String(value)
                : value
          ])
        )
      })
    );
  };
}
