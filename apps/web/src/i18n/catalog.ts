import {
  ClientResponseError,
  HttpError,
  RequestTimeoutError
} from "@tsz/api-client";
import {
  RefreshUnconfirmedError,
  SessionRefreshError,
  SessionRefreshHttpError
} from "@tsz/shared/auth/tokenManager";
import {
  type createInterfaceI18n,
  type InterfaceResourceBundles
} from "@tsz/shared/i18n";
type i18n = ReturnType<typeof createInterfaceI18n>;

import type {
  CatalogArguments,
  WebCatalogKey,
  WebParameterValue
} from "./types";
export type { WebKey } from "./types";

export type WebMessages = Record<string, readonly [string, string, string]>;
export type OriginalText = { readonly original: string };
export const originalText = (original: string): OriginalText => ({ original });
/** 只能经类型安全的 localText 创建，原文参数不会再次查译文。 */
const localTextBrand = Symbol("Web local message");
export type LocalText = {
  readonly [localTextBrand]: true;
  readonly key: string;
  readonly catalog: WebCatalog;
  readonly values?: WebValues;
};
export type WebValues = Record<string, WebParameterValue>;
export type ServerText = {
  readonly serverText: string;
  readonly requestLocale: string;
};
export type WebNotice = "" | OriginalText | LocalText | ServerText;
/** 只读取作者登记的诊断映射，未知 code/原文不能命中 Object 原型。 */
export function lookupWebNotice(
  notices: Readonly<Record<string, WebNotice>>,
  key: string | undefined
): WebNotice | undefined {
  return key !== undefined && Object.hasOwn(notices, key)
    ? notices[key]
    : undefined;
}
export function localText<C extends WebCatalog, K extends WebCatalogKey<C>>(
  catalog: C,
  key: K,
  ...args: CatalogArguments<C, K>
): LocalText {
  return { [localTextBrand]: true, catalog, key, values: args[0] };
}
export class LocalWebError extends Error {
  constructor(readonly notice: LocalText) {
    super(notice.key);
  }
}
export const webErrorText = (error: unknown, fallback: WebNotice): WebNotice =>
  error instanceof RefreshUnconfirmedError
    ? localText(webCommon, "webCommon:session_refresh_unconfirmed")
    : error instanceof SessionRefreshError ||
        error instanceof SessionRefreshHttpError
      ? localText(webCommon, "webCommon:session_refresh_check")
      : error instanceof ClientResponseError
        ? localText(webCommon, "webCommon:response_unavailable")
        : error instanceof LocalWebError
          ? error.notice
          : error instanceof RequestTimeoutError
            ? localText(
                webCommon,
                error.method === "GET" || error.method === "HEAD"
                  ? "webCommon:request_timeout"
                  : "webCommon:request_timeout_unknown"
              )
            : error instanceof HttpError && error.requestLocale
              ? {
                  serverText: error.message,
                  requestLocale: error.requestLocale
                }
              : error instanceof Error
                ? originalText(error.message)
                : fallback;
export interface WebText<C extends WebCatalog> {
  <K extends WebCatalogKey<C>>(key: K, ...args: CatalogArguments<C, K>): string;
  (notice: WebNotice | null | undefined): string;
}
export interface WebCatalog<
  N extends string = string,
  M extends WebMessages = WebMessages,
  P extends Partial<Record<keyof M, { parameter: string; one: string }>> =
    Partial<Record<keyof M, { parameter: string; one: string }>>
> {
  namespace: N;
  messages: M;
  plurals: P;
  resources: InterfaceResourceBundles;
}

/** 保留命名空间、稳定键和模板参数的字面量类型。 */
export function defineWebMessages<
  const N extends string,
  const M extends WebMessages
>(
  namespace: N,
  messages: M,
  american?: Partial<Record<keyof M, string>>
): WebCatalog<N, M, Record<never, never>>;
export function defineWebMessages<
  const N extends string,
  const M extends WebMessages,
  const P extends Partial<Record<keyof M, { parameter: string; one: string }>>
>(
  namespace: N,
  messages: M,
  american: Partial<Record<keyof M, string>>,
  plurals: P
): WebCatalog<N, M, P>;
export function defineWebMessages(
  namespace: string,
  messages: WebMessages,
  american: Partial<Record<string, string>> = {},
  plurals: WebCatalog["plurals"] = {}
): WebCatalog {
  const column = (index: 0 | 1 | 2) =>
    Object.fromEntries(
      Object.entries(messages).map(([key, row]) => [key, row[index]])
    );
  const english = column(2);
  const regional: Record<string, string> = {};
  for (const [key, value] of Object.entries(american))
    if (typeof value === "string") regional[key] = value;
  for (const [key, value] of Object.entries<
    { parameter: string; one: string } | undefined
  >(plurals)) {
    if (!value) continue;
    english[`${key}_one`] = value.one;
    english[`${key}_other`] = messages[key]![2];
    if (regional[key]) {
      regional[`${key}_one`] = value.one;
      regional[`${key}_other`] = regional[key];
    }
  }
  const catalog = {
    namespace,
    messages,
    plurals,
    resources: {
      "zh-Hans": { [namespace]: column(0) },
      "zh-Hant": { [namespace]: column(1) },
      en: { [namespace]: english },
      "en-US": { [namespace]: regional }
    }
  };
  return catalog;
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
  session_refresh_check: [
    "会话刷新未完成，请先查看操作结果；必要时重新登录。",
    "工作階段更新未完成，請先查看操作結果；必要時重新登入。",
    "The session refresh did not complete. Check the operation result and sign in again if needed."
  ],
  session_refresh_unconfirmed: [
    "会话刷新结果尚未确认，请重新登录，并先查看操作结果。",
    "工作階段更新結果尚未確認，請重新登入，並先查看操作結果。",
    "The session refresh result is unconfirmed. Sign in again and check the operation result."
  ],
  previous_language_error: [
    "错误详情使用了之前的语言，请先查看当前状态再重试。",
    "錯誤詳情使用了先前的語言，請先查看目前狀態再重試。",
    "The error details were in the previous language. Check the current state before trying again."
  ],
  unknown_language_error: [
    "错误详情的语言无法确认，请先查看当前状态再重试。原文：{{detail}}",
    "無法確認錯誤詳情的語言，請先查看目前狀態再重試。原文：{{detail}}",
    "The language of the error details is unconfirmed. Check the current state before trying again. Original details: {{detail}}"
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

export function webText<C extends WebCatalog>(
  instance: i18n,
  catalog: C
): WebText<C> {
  // 调用方的键由目录字面量类型约束；localText 只接收已登记的完整键。
  // i18next 的动态命名空间重载在此受控边界收窄，不把断言传播到业务调用点。
  const translate = instance.t as unknown as (
    key: string,
    options: { ns: string; count?: number } & Record<
      string,
      string | number | bigint
    >
  ) => string;
  const render = (
    source: string | OriginalText | LocalText | ServerText | null | undefined,
    values?: WebValues,
    scope: WebCatalog = catalog
  ): string => {
    if (!source) return "";
    if (typeof source !== "string") {
      if ("original" in source) return source.original;
      if ("serverText" in source)
        return source.requestLocale === "unknown"
          ? render(
              localText(webCommon, "webCommon:unknown_language_error", {
                detail: originalText(source.serverText)
              })
            )
          : source.requestLocale === instance.language
            ? source.serverText
            : render(localText(webCommon, "webCommon:previous_language_error"));
      scope = source.catalog;
      values = source.values;
      source = source.key;
    }
    const separator = source.indexOf(":");
    const namespace = source.slice(0, separator);
    const key = source.slice(separator + 1);
    const selected: WebCatalog =
      namespace === webCommon.namespace ? webCommon : scope;
    if (
      separator < 1 ||
      namespace !== selected.namespace ||
      !Object.hasOwn(selected.messages, key)
    )
      throw new Error(`Unregistered Web translation: ${source}`);
    addWebCatalog(instance, selected);
    const plural = selected.plurals[key];
    return String(
      translate(key, {
        ns: namespace,
        ...(plural ? { count: Number(values?.[plural.parameter]) } : {}),
        ...Object.fromEntries(
          Object.entries(values ?? {}).map(([parameter, value]) => [
            parameter,
            typeof value === "object" ? render(value) : value
          ])
        )
      })
    );
  };
  return render as WebText<C>;
}
