"use client";

import { Card } from "@tsz/ui";

// 注册流程与登录共用账号体系,这里先占位。
export function RegisterForm() {
  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">注册</h1>
      <p className="text-sm text-gray-500">手机号/邮箱注册,与登录同一入口。</p>
    </Card>
  );
}
