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
