import { describe, expect, it } from "vitest";
import {
  accountToDisplayName,
  displayNameError,
  displayNameLength,
  normalizeDisplayName,
  hasDisplayNameForbiddenChars,
  isCode,
  isEmail,
  isPhone,
  isRegisterPassword,
  isValidAccount
} from "./validate";

describe("isPhone", () => {
  it.each(["13800138000", "15912345678", "19999999999", "17000000000"])(
    "接受合法手机号 %s",
    (v) => {
      expect(isPhone(v)).toBe(true);
    }
  );

  it.each([
    ["", "空串"],
    ["1234567890", "首位非 1 且段错"],
    ["12345678901", "第二位为 2(应为 3-9)"],
    ["1380013800", "只有 10 位"],
    ["138001380000", "12 位过长"],
    ["1380013800a", "含字母"],
    ["23800138000", "首位非 1"],
    [" 13800138000", "前导空格"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isPhone(v)).toBe(false);
  });
});

describe("isEmail", () => {
  it.each(["a@b.com", "user.name@sub.example.cn", "x+tag@y.io"])(
    "接受合法邮箱 %s",
    (v) => {
      expect(isEmail(v)).toBe(true);
    }
  );

  it.each([
    ["", "空串"],
    ["a@b", "缺少顶级域"],
    ["nope", "无 @"],
    ["@b.com", "缺少本地部分"],
    ["a@@b.com", "双 @"],
    ["a b@c.com", "含空格"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isEmail(v)).toBe(false);
  });
});

describe("isValidAccount", () => {
  it("手机号合法即通过", () => {
    expect(isValidAccount("13800138000")).toBe(true);
  });
  it("邮箱合法即通过", () => {
    expect(isValidAccount("a@b.com")).toBe(true);
  });
  it("两者都不合法则拒绝", () => {
    expect(isValidAccount("bad")).toBe(false);
    expect(isValidAccount("")).toBe(false);
  });
});

describe("isCode", () => {
  it.each(["1234", "123456", "12345678"])("接受纯数字验证码 %s", (v) => {
    expect(isCode(v)).toBe(true);
  });

  it.each([
    ["", "空串"],
    ["123", "不足 4 位"],
    ["123456789", "超过 8 位"],
    ["12 34", "含空格"],
    ["12a4", "含字母"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isCode(v)).toBe(false);
  });
});

describe("isRegisterPassword", () => {
  it.each([
    " Mixed!密码🙂 river cloud ",
    "orchard silver river cloud",
    "941807362590418735",
    "界🙂".repeat(64)
  ])("支持原样自由字符 %s", (value) => {
    expect(isRegisterPassword(value)).toBe(true);
  });
  it("按 Unicode 字符计数处理长度边界", () => {
    expect(isRegisterPassword("🙂".repeat(14))).toBe(false);
    expect(isRegisterPassword("🙂".repeat(15))).toBe(true);
    expect(isRegisterPassword("🙂".repeat(128))).toBe(true);
    expect(isRegisterPassword("🙂".repeat(129))).toBe(false);
    expect(isRegisterPassword("")).toBe(false);
  });
});

describe("displayNameError", () => {
  it("按码点校验50/51字符边界而不截断", () => {
    expect(displayNameLength("🙂".repeat(50))).toBe(50);
    expect(displayNameError("🙂".repeat(50))).toBeNull();
    expect(displayNameError("🙂".repeat(51))).toBe("昵称不能超过 50 个字符");
  });

  it("按Rust的White_Space裁剪边界，保留BOM供禁字符校验", () => {
    expect(normalizeDisplayName("\u0085 小明　\u0085")).toBe("小明");
    expect(displayNameError("\u0085🙂\u0085")).toBeNull();
    const bom = String.fromCharCode(0xfeff);
    expect(normalizeDisplayName(`${bom}Alice${bom}`)).toBe(`${bom}Alice${bom}`);
    expect(displayNameError(`${bom}Alice`)).toBe(
      "昵称不能包含 < > 或不可见字符"
    );
    expect(displayNameError(" \u0085 ")).toBe("昵称需为 1–50 个字符");
  });

  it("长内部空白保留原样，长边界空白只裁剪边界", () => {
    const spaces = " ".repeat(40_000);
    const internal = `a${spaces}b`;
    expect(normalizeDisplayName(internal)).toBe(internal);
    expect(displayNameError(internal)).toBe("昵称不能超过 50 个字符");
    expect(normalizeDisplayName(`${spaces}🙂${spaces}`)).toBe("🙂");
  });
});

describe("displayNameError", () => {
  it("长内部空白不回溯，规范化和校验保持响应预算", () => {
    const value = `a${" ".repeat(80_000)}b`;
    const start = performance.now();
    expect(normalizeDisplayName(value)).toBe(value);
    expect(displayNameError(value)).toBe("昵称不能超过 50 个字符");
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it("长边界空白仅裁剪边界，保留合法首码点", () => {
    const spaces = " ".repeat(40_000);
    expect(normalizeDisplayName(`${spaces}😀${spaces}`)).toBe("😀");
  });

  it("按 Rust White_Space trim，不移除 BOM", () => {
    expect(normalizeDisplayName(" \u0085 Alice　\u0085 ")).toBe("Alice");
    expect(normalizeDisplayName("﻿Alice﻿")).toBe("﻿Alice﻿");
    expect(displayNameError("﻿Alice")).toBe("昵称不能包含 < > 或不可见字符");
    expect(displayNameError(" \u0085 ")).toBe("昵称需为 1–50 个字符");
  });

  it("trim 后按码点计数，允许 50 个 emoji/中文/组合字符", () => {
    for (const name of ["😀".repeat(50), "字".repeat(50), "é".repeat(25)]) {
      expect(displayNameLength(` \u0085${name}\u0085 `)).toBe(50);
      expect(displayNameError(` \u0085${name}\u0085 `)).toBeNull();
      expect(displayNameError(`${name}a`)).toBe("昵称不能超过 50 个字符");
    }
  });

  it.each(["a\u0085b", "a‍b", "a\u0000b", "<b>"])(
    "拒绝剩余 Cc/Cf/尖括号 %s",
    (name) => {
      expect(displayNameError(name)).toBe("昵称不能包含 < > 或不可见字符");
    }
  );

  it("沿用先长度再禁字符，不做 NFC 规范化", () => {
    expect(displayNameError(`${"a".repeat(50)}<`)).toBe(
      "昵称不能超过 50 个字符"
    );
    expect(normalizeDisplayName("é")).toBe("é");
  });
});

describe("hasDisplayNameForbiddenChars", () => {
  // 不可见字符一律用 \u 转义写,避免源码里出现肉眼不可辨的字面量。
  it.each([
    ["标签字符 <", "<script>"],
    ["标签字符 >", "a>b"],
    ["控制字符 NUL", "a\u0000b"],
    ["零宽空格", "a\u200bb"],
    ["BOM", "\ufeffAlice"],
    ["bidi 覆盖", "a\u202eb"]
  ])("检出禁字符:%s", (_label, v) => {
    expect(hasDisplayNameForbiddenChars(v)).toBe(true);
  });

  // " ' & 与后端规则一致,属合法昵称字符,不得误拦。
  it.each(["Alice", "小明", "他/她", "user_01", "O'Brien", "Tom&Jerry", 'a"b'])(
    "放行正常昵称 %s",
    (v) => {
      expect(hasDisplayNameForbiddenChars(v)).toBe(false);
    }
  );
});

describe("accountToDisplayName", () => {
  it("手机号原样返回", () => {
    expect(accountToDisplayName("13800138000")).toBe("13800138000");
  });

  it("邮箱取 @ 前缀;合法的 ' & 保留", () => {
    expect(accountToDisplayName("alice@example.com")).toBe("alice");
    expect(accountToDisplayName("o'brien@x.com")).toBe("o'brien");
    expect(accountToDisplayName("tom&jerry@qq.com")).toBe("tom&jerry");
  });

  it("剔除 local part 里的禁字符", () => {
    expect(accountToDisplayName('"a<b"@x.com')).toBe('"ab"');
    expect(accountToDisplayName("zero\u200bwidth@x.com")).toBe("zerowidth");
  });

  it("超长 local part 按字符截到 50", () => {
    const local = "a".repeat(64);
    expect(accountToDisplayName(`${local}@x.com`)).toBe("a".repeat(50));
  });

  it("剔空退回默认昵称「用户」", () => {
    expect(accountToDisplayName("<><>@x.com")).toBe("用户");
  });
});
