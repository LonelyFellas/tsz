"use client";

import { Button, Card } from "@tsz/ui";
import { isValidAccount } from "@tsz/shared";
import { useState } from "react";

export function LoginForm() {
  const [account, setAccount] = useState("");
  const valid = isValidAccount(account);

  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">登录 / 注册</h1>
      <input
        className="mb-3 w-full rounded border px-3 py-2"
        placeholder="手机号 / 邮箱"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
      />
      <Button disabled={!valid} className="w-full">
        获取验证码
      </Button>
      {!valid && account && (
        <p className="mt-2 text-sm text-red-500">请输入有效的手机号或邮箱</p>
      )}
    </Card>
  );
}
