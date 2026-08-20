# 英美方言偏好化（A1）：后端改动提案

> **给后端同学的一页纸。** 前端 A1 改造的阶段 1–5 已全部落地并合入评审，
> 剩下的两步卡在后端。本文把它们写成可直接排期的任务。
>
> - **本文不修改 `tsz-rust` 仓库任何内容**，建议由后端同学消化后落到
>   `tsz-rust/docs/frontend-integration.md`。
> - 前端侧的完整背景见同目录 [`requirements.md`](./requirements.md) 与
>   [`design.md`](./design.md)。
> - 核对基线：`tsz-rust` `main` @ `cc43556`，本地 `cargo run` + Docker
>   `tsz-rust-db-1` 实测（2026-08-20）。

## 一句话背景

「英美式区分」原来是**逐词条的检测驱动决策**，现在改成**管理员账号上的个人偏好**（默认英式）。
词典给出的双拼写（`centre` / `center`）作为客观事实**继续保留**——查重键
`(language, kind, dialect_scope, normalized_headword)` 正是靠它把两种拼写认成同一条词条，
砍掉会让同一个词裂成两条且不可逆。变的只是**平台自己写的内容**（英文释义、英文例句、
语法结构）不再按方言分叉，只维护一份，口径取管理员偏好。

前端已经做完的部分**没有改动任何 wire 契约**：`@tsz/types` 与
`packages/api-client/src/openapi.snapshot.json` 零变更，契约测试不用改。
下面两条提案都是**新增能力 / 放宽约束**，不破坏现有契约。

---

## P1 · 放宽语法结构的方言形状校验（阻塞前端阶段 6）

**优先级：中。** 不做也能用，但会一直留着一段前端 shim 和一批冗余数据。

### 现状

`src/lexicon/validation/meanings.rs`：

```rust
let expected_dialects = if matches!(headwords, WordHeadwordsV2::Unified { .. }) {
    vec![Dialect::Common]
} else {
    vec![Dialect::Uk, Dialect::Us]
};
```

随后要求每条 `grammar_structures[].variants` 的方言集合与 `expected_dialects`
**精确相等**，否则 `grammar_variants_invalid`。

### 问题

A1 之后语法结构只维护一份，但 `distinguish` 词条被强制要求存两条。前端现在的做法是
**写两条同值镜像**（`mirrorGrammarStructure`）：UI 只有一个输入框，保存时把偏好侧文本
复制到两条变体上。后果有三：

1. wire 与库里存着一份冗余数据；
2. 学习端将来读到会显示成「英式：a centre / 美式：a centre」这种没有信息量的两行；
3. 存量两侧文本不同的词条，收敛时非偏好侧会被覆盖——前端已经用确认框显式告知并计数，
   但这是被迫的。

### 提案

对 `distinguish` 词条**同时接受** `[common]` 与 `[uk, us]` 两种形状
（`unified` 词条维持只接受 `[common]`）。即把「精确相等」放宽为「是允许集合之一」。

```rust
let allowed: &[&[Dialect]] = if matches!(headwords, WordHeadwordsV2::Unified { .. }) {
    &[&[Dialect::Common]]
} else {
    &[&[Dialect::Common], &[Dialect::Uk, Dialect::Us]]
};
// variants 的方言集合命中任一即通过
```

### 兼容性

**纯放宽**，存量数据与旧前端一律不受影响。不需要数据迁移。

**可选后续**：提供一次性收敛命令，把已有的同值镜像双条合并为单条 `common`；
不合并也不影响正确性，只是留着冗余。

### 验收标准

- [ ] `distinguish` 词条的语法结构只提交一条 `common` 变体时保存 / 发布成功；
- [ ] 提交 `[uk, us]` 两条仍然成功（旧前端、存量数据不受影响）；
- [ ] `unified` 词条提交 `[uk, us]` 仍然被拒（不放宽这一侧）；
- [ ] 同一条语法结构从「两条镜像」改成「一条 common」时保存成功——
      注意这会删掉 uk/us 两个节点、新建一个 common 节点，见下方「节点身份」一节。

### 前端解锁什么

删掉 `mirrorGrammarStructure` 与相关 shim（代码里已带
`TODO(dialect-preference-migration 阶段 6)` 与删除条件），语法结构在 wire 上也变成真正的一份。

---

## P2 · 管理员方言偏好持久化（阻塞前端阶段 7）

**优先级：高。** 现在偏好只存在浏览器 `localStorage`，换设备 / 换浏览器 / 清缓存都会
静默变回英式——管理员会以为是词条数据变了，而不是自己的设置丢了，这是最难排查的一类困惑。

### 现状

- `AdminProfileResponse` 只有 `id / phone / display_name / role / permissions`；
- `admins` 表没有任何偏好列。

### 提案

**读**：`GET /api/v1/admin/profile` 响应新增 `preferences`（字段恒在，缺省即默认值）：

```jsonc
{
  "id": "...",
  "display_name": "...",
  "phone": "...",
  "role": "admin",
  "permissions": ["..."],
  "preferences": { "dialect": "uk" } // 新增；枚举 "uk" | "us"，默认 "uk"
}
```

**写**：新增 `PATCH /api/v1/admin/settings/preferences`

```jsonc
// 请求
{ "dialect": "us" }
// 200
{ "preferences": { "dialect": "us" } }
// 422：dialect 不在枚举内（application/problem+json，沿用 RFC 9457 既有约定）
```

**存储**：建议 `admins.preferences jsonb NOT NULL DEFAULT '{}'`，读时缺省填 `uk`。
为一个两态开关新建一张表不划算。

**权限**：任何已登录管理员都能读写**自己的**；不提供改他人偏好的能力，也不要做成平台全局配置
（A1 明确是个人偏好）。

### 关键约定

**默认值以后端为准，前端不持有第二处默认。** 这是提案的重点——两边各写一个默认值，
一旦漂移就会出现「我明明没改过它怎么变了」。前端现在的 `DEFAULT_DIALECT_PREFERENCE`
在 P2 落地后会降级为「拿不到 profile 时的离线兜底」。

### 验收标准

- [ ] 新建管理员 `GET /profile` 返回 `preferences.dialect === "uk"`；
- [ ] `PATCH` 后再 `GET`，值持久化且跨会话保持；
- [ ] `PATCH` 非法值返回 422 且不落库；
- [ ] A 管理员改自己的偏好不影响 B 管理员；
- [ ] 老数据（`preferences` 为空对象）读出来是 `uk`，不报错。

### 前端解锁什么

事实源切到服务端，`localStorage` 降为离线缓存；同时给 `@tsz/types` 加 wire 类型、
`@tsz/api-client` 加封装、补 method/path/body 契约测试。

---

## P3 · 列表行的 headword 结构化（可选，优先级低）

### 现状

`GET /api/v1/admin/lexicon/entries` 的行 `headword` 由
`string_agg(headword, ' / ' ORDER BY dialect)` 拼成 `"colour / color"`
（`src/lexicon/repository/query.rs:141`）。前端拿不到两侧的结构，
**无法按管理员偏好决定哪一侧在前**（同一限制在 PR #135 已记录过一次）。

### 提案

保留 `headword` 不动（不破坏现有前端），额外返回结构化字段：

```jsonc
{
  "headword": "colour / color", // 保留
  "headwords": {
    "mode": "distinguish",
    "uk": "colour",
    "us": "color",
    "source_dialect": "us"
  }
}
```

不做的后果仅仅是列表里的主词顺序不跟随偏好（词条页内已经跟随了），不影响录入。

---

## 一条已经踩过的坑，请在评审 P1 时一并注意

**节点 ID 的身份包含方言。** `src/lexicon/validation/structure.rs` 的
`node_binding_changed`「节点 ID 不能更换父节点或内容槽位」把
`node_role = text_variant_role(field_role, "en", dialect)` 里的 dialect 也算进了身份。

前端在做「英美双份英文内容收敛为单份」时，原本想复用偏好侧 `text_variant` 的节点 ID
以保留稳定身份，结果同一个 ID 从 `uk` 槽挪到 `common` 槽被判非法，**整个 meanings
保存 422**（`centre / center` 那条存量词条实测报 3 条）。前端已改为**收敛时新起节点 ID**。

**这条对 P1 同样成立**：语法结构从「两条 uk/us 镜像」改成「一条 common」时，
也必须是删旧节点 + 建新节点，不能复用。如果后端打算提供收敛命令，请按同一口径处理。

顺带一提：这个不变量在前端的 mock 与 e2e mock 里都没有实现，所以这类问题只能靠
真机联调发现——前端侧已经把「凡改动节点 ID 归属的改动必须真机验收」写进了实施纪律。

---

## 排期建议

| 提案 | 阻塞什么                     | 建议优先级 | 大小 |
| ---- | ---------------------------- | ---------- | ---- |
| P2   | 偏好跨设备一致（用户可感知） | 高         | 中   |
| P1   | 删掉前端 shim 与冗余数据     | 中         | 小   |
| P3   | 列表主词顺序跟随偏好         | 低         | 小   |

P1 与 P2 互相独立，可并行，也可分别排期——前端阶段 6、7 各自只依赖其中一条，
两者都不做也不影响已落地的阶段 1–5 正常使用。
