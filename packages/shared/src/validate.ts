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

export function passwordLengthError(value: string): string | null {
  const length = Array.from(value).length;
  if (!length) return "请输入密码";
  if (length < PASSWORD_MIN_LENGTH) return "密码至少需要 15 个字符";
  if (length > PASSWORD_MAX_LENGTH) return "密码不能超过 128 个字符";
  return null;
}

// 前端只检查长度，弱密码和泄露名单由后端权威校验。
export function isRegisterPassword(value: string): boolean {
  return passwordLengthError(value) === null;
}

// 昵称与 Rust DisplayName::parse 对齐，先 trim 再检查码点长度和 Cc/Cf。
const DISPLAY_NAME_FORBIDDEN_RE = /[<>\p{Cc}\p{Cf}]/u;
const DISPLAY_NAME_FORBIDDEN_RE_G = /[<>\p{Cc}\p{Cf}]/gu;

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

export function displayNameError(value: string): string | null {
  const normalized = normalizeDisplayName(value);
  const length = displayNameLength(normalized);
  if (!length) return "昵称需为 1–50 个字符";
  if (length > DISPLAY_NAME_MAX) return "昵称不能超过 50 个字符";
  if (hasDisplayNameForbiddenChars(normalized))
    return "昵称不能包含 < > 或不可见字符";
  return null;
}

export function hasDisplayNameForbiddenChars(v: string): boolean {
  return DISPLAY_NAME_FORBIDDEN_RE.test(v);
}

/**
 * 账号 → 注册占位昵称。原型注册页不单独采集昵称,用账号占位;邮箱要
 * 剥掉域名,且 local part 可长于 50(上限 64)、极端形式(引号写法)还能
 * 含禁字符,直接透传会被后端 400。剔禁字符、按字符截到上限,剔空则退回「用户」。
 */
export function accountToDisplayName(account: string): string {
  const name = account
    .replace(/@.*$/, "")
    .replace(DISPLAY_NAME_FORBIDDEN_RE_G, "")
    .trim();
  return [...name].slice(0, DISPLAY_NAME_MAX).join("") || "用户";
}
