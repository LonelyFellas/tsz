import { Card } from "@tsz/ui";
import { formatCoins } from "@tsz/shared";

// 天生币:余额与获取明细。
export function CoinsPanel({ balance = 0 }: { balance?: number }) {
  return (
    <section>
      <h1 className="mb-4 text-xl font-bold">天生币</h1>
      <Card>当前余额:{formatCoins(balance)}</Card>
    </section>
  );
}
