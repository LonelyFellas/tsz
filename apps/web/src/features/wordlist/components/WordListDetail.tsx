import { Card } from "@tsz/ui";

// 词表详情 + 评论入口(评论需敏感词审核,提交后置 pending)。
export function WordListDetail({ id }: { id: string }) {
  return (
    <section>
      <Card>
        <h1 className="text-xl font-bold">词表 #{id}</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          单词列表、自定义词汇、公开/私密状态与审核结果在此展示。
        </p>
      </Card>
    </section>
  );
}
