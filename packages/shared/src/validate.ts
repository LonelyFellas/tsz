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

// 注册密码:11-20 位,字母 + 数字组合,不区分大小写。
const REGISTER_PASSWORD_RE = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d]{11,20}$/;

export function isRegisterPassword(v: string): boolean {
  return REGISTER_PASSWORD_RE.test(v);
}
