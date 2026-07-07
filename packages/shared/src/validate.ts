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

// 后台管理员密码弱词黑名单:与后端 validateAdminPassword 对齐(tsz-go
// internal/admin/service.go 的 commonWeakSubstrings)。前端做提交前预检、即时提示,
// 后端仍是权威把关——这张表只镜像那 7 个词,后端增删时须两处同步。
// 注意后端注释:"admin" 是本域合法 token,故意不在表内,只拦更具体的 "admin123"。
const ADMIN_PASSWORD_WEAK_SUBSTRINGS = [
  "password",
  "qwerty",
  "123456",
  "letmein",
  "iloveyou",
  "welcome",
  "admin123"
];

/**
 * 后台密码若命中弱词黑名单(子串,不区分大小写)返回命中的词,否则 null。
 * 返回命中词而非布尔,便于前端提示「包含常见弱词『admin123』」。
 */
export function findAdminPasswordWeakWord(v: string): string | null {
  const lower = v.toLowerCase();
  return ADMIN_PASSWORD_WEAK_SUBSTRINGS.find((w) => lower.includes(w)) ?? null;
}

// 昵称禁字符:与后端 validateDisplayName 对齐(tsz-go internal/user/service.go,
// 规则同见 docs/api.md)——只拒标签字符 < > 与控制/不可见字符(Cc/Cf:NUL、
// 零宽空格、BOM、bidi 覆盖等);" ' & 是合法昵称字符(O'Brien、Tom&Jerry),不拦。
const DISPLAY_NAME_FORBIDDEN_RE = /[<>\p{Cc}\p{Cf}]/u;
const DISPLAY_NAME_FORBIDDEN_RE_G = /[<>\p{Cc}\p{Cf}]/gu;

// 后端 display_name 长度上限(1–50 字符,docs/api.md)。
export const DISPLAY_NAME_MAX = 50;

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
