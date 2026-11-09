// 纯校验工具。

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPhone(v: string): boolean {
  return PHONE_RE.test(v);
}

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

/** 注册账号:手机号或邮箱二选一。 */
export function isValidAccount(v: string): boolean {
  return isPhone(v) || isEmail(v);
}

// 验证码:纯数字,4-8 位(原型标注「验证码都是数字」)。
const CODE_RE = /^\d{4,8}$/;

export function isCode(v: string): boolean {
  return CODE_RE.test(v);
}

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HINT = "15–128 个字符，区分大小写，支持符号和空格";

export function passwordLengthErrorCode(value: string) {
  const length = Array.from(value).length;
  if (!length) return "password_missing" as const;
  if (length < PASSWORD_MIN_LENGTH) return "password_too_short" as const;
  if (length > PASSWORD_MAX_LENGTH) return "password_too_long" as const;
  return null;
}

export function passwordLengthError(value: string): string | null {
  const code = passwordLengthErrorCode(value);
  const messages = {
    password_missing: "请输入密码",
    password_too_short: "密码至少需要 15 个字符",
    password_too_long: "密码不能超过 128 个字符"
  };
  return code ? messages[code] : null;
}

// 前端只检查长度，弱密码和泄露名单由后端权威校验。
export function isRegisterPassword(value: string): boolean {
  return passwordLengthError(value) === null;
}

// 昵称与 Rust DisplayName::parse 对齐，先 trim 再检查码点长度和 Cc/Cf。
const DISPLAY_NAME_FORBIDDEN_RE = /[<>\p{Cc}\p{Cf}]/u;

// 后端 display_name 长度上限(1–50 字符,docs/api.md)。
export const DISPLAY_NAME_MAX = 50;

const DISPLAY_NAME_WHITESPACE_RE = /\p{White_Space}/u;

export function normalizeDisplayName(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && DISPLAY_NAME_WHITESPACE_RE.test(value[start]!))
    start += 1;
  while (end > start && DISPLAY_NAME_WHITESPACE_RE.test(value[end - 1]!))
    end -= 1;
  return value.slice(start, end);
}

export function displayNameLength(value: string): number {
  return Array.from(normalizeDisplayName(value)).length;
}

export function displayNameErrorCode(value: string) {
  const normalized = normalizeDisplayName(value);
  const length = displayNameLength(normalized);
  if (!length) return "display_name_required" as const;
  if (length > DISPLAY_NAME_MAX) return "display_name_too_long" as const;
  if (hasDisplayNameForbiddenChars(normalized))
    return "display_name_forbidden" as const;
  return null;
}

export function displayNameError(value: string): string | null {
  const code = displayNameErrorCode(value);
  const messages = {
    display_name_required: "昵称需为 1–50 个字符",
    display_name_too_long: "昵称不能超过 50 个字符",
    display_name_forbidden: "昵称不能包含 < > 或不可见字符"
  };
  return code ? messages[code] : null;
}

export function hasDisplayNameForbiddenChars(v: string): boolean {
  return DISPLAY_NAME_FORBIDDEN_RE.test(v);
}
