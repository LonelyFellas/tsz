"use client";

import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { SectionHeading } from "./SectionHeading";

export function RoleEntry() {
  const uiText = useWebText(webHome);
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8 sm:pb-24">
      <SectionHeading
        title={uiText("一个平台。教与学，都从容。")}
        desc={uiText("为自己的目标学习，也为每一个学生助力。")}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <article className="flex flex-col items-start rounded-3xl bg-muted p-8 sm:p-10">
          <p className="text-sm font-medium text-foreground-muted">
            {uiText("我是学生")}
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            {uiText("按自己的节奏，")}
            <br />
            {uiText("一步一步学。")}
          </h3>
          <p className="mt-5 max-w-sm text-base leading-7 text-foreground-muted">
            {uiText("浏览词表，完成每日练习，打卡积累天生币。")}
          </p>
          <Button asChild size="sm" className="mt-8 min-h-11 sm:min-h-10">
            <Link href="/wordlists">
              {uiText("选择词表")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </article>
        <article className="flex flex-col items-start rounded-3xl bg-muted p-8 sm:p-10">
          <p className="text-sm font-medium text-foreground-muted">
            {uiText("我是老师")}
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            {uiText("让每一次教学，")}
            <br />
            {uiText("都有据可循。")}
          </h3>
          <p className="mt-5 max-w-sm text-base leading-7 text-foreground-muted">
            {uiText("整理与分享词表，申请教师认证。班级与教学任务暂未开放。")}
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-8 min-h-11 sm:min-h-10"
          >
            <Link href="/apply-teacher">
              {uiText("申请成为老师")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </article>
      </div>
    </section>
  );
}
