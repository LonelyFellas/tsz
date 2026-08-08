# 新建单词流程重构：测试矩阵

## 自动化矩阵

| ID  | 层级             | 场景                         | 输入/前置条件                                                     | 预期行为                                                              | 优先级 |
| --- | ---------------- | ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| T01 | contract         | V2 endpoint method/path/body | detect/create/impact/save/validate/publish/dialect suggestion     | 相对 `/admin` 路径、snake_case body 与设计一致；proposal 进入 PENDING | P0     |
| T02 | unit/mock        | `center` 检测成功            | AmE 输入，词典匹配 `centre / center`，查重 clear                  | 返回完整 suggestions、source_dialect=us；检测本身不创建资源           | P0     |
| T03 | unit/mock        | 检测阻断矩阵                 | duplicate、phrase、not_found、builtin/smart unavailable、expired  | 各状态可区分；不可创建；错误与业务状态符合契约                        | P0     |
| T04 | integration/mock | 幂等创建 V2 草稿             | 同 detection + 同 idempotency_key 重试                            | 返回同一 ID/revision；完整 detection snapshot；统计只增加一次         | P0     |
| T05 | unit/UI          | 共享 base 与多词形组         | `far` 的 farther/further 两组；切换拼写/音标规则                  | base 拼写只读且不分叉；slot ID/顺序稳定；强制联动正确                 | P0     |
| T06 | unit/mock        | forms save 与 complete       | 不完整 save、完整 complete、stale revision、重复 operation_id     | save 可存不完整；complete 推进；409 不覆盖；重试返回相同结果          | P0     |
| T07 | integration/UI   | 第 1 步检测与建草稿          | 点击检测、修改输入产生 stale response、重复/短语/失败             | 只在点击时请求；旧响应不显示；阻断态不可继续；错误保留输入            | P0     |
| T08 | integration/UI   | 第 2 步编辑与保存            | 新增/删除 POS、组、slot、读音；save/complete 失败                 | 可编辑结构与 wire 对齐；失败保值；成功后才推进                        | P0     |
| T09 | unit/UI          | 文本 variant 状态与手工保护  | ready/missing、生成建议、取消预览、manual 目标值                  | 已有切换不请求；missing 明确；确认后写 converted；不静默覆盖 manual   | P0     |
| T10 | unit/mock        | meanings 与 focus/context    | 四种释义、例句、固定 focus、可选 context、关系词                  | 稳定 ID；恰好一个 focus；目标 word/sense 均保存                       | P0     |
| T11 | unit/mock        | 发布完整性与幂等             | 缺 grammar/中文释义/方言/发音/focus；完整草稿；响应丢失重试       | issues 可定位；不完整不发布；完整变 published；同 key 不重复副作用    | P0     |
| T12 | integration/mock | 列表/统计/详情闭环           | 草稿创建、刷新、发布、删除                                        | 同一数据源立即可读；创建计数一次；publish 不重复计数；ID 不变化       | P0     |
| T13 | integration/UI   | V1/V2 路由矩阵               | V1、V2 draft 各 reachable step、V2 published、V2 误入 legacy edit | 分别编辑/继续创建/查看；不可达路由归一；V2 不进入旧整树编辑器         | P0     |
| T14 | unit/build       | feature/mock flags           | 默认 dev/test、默认 production、显式 true/false、非法值           | dev/test 默认新向导+mock；生产默认真实且 mock=true fail closed        | P0     |
| T15 | integration/UI   | 草稿恢复与未保存离开         | 保存后硬刷新；未保存时 step/back/刷新/关闭                        | 恢复最后成功 revision；未保存修改触发确认                             | P1     |
| T16 | unit/mock        | storage 隔离与损坏恢复       | schema 不兼容、坏 JSON、不同 admin profile、登出                  | 清理损坏/旧版本；namespace 隔离；不存凭据                             | P1     |
| T17 | integration/UI   | 权限和 HTTP 错误             | 401/403/409/410/413/422/500                                       | 统一鉴权或稳定错误反馈；revision conflict 不覆盖；field issue 可定位  | P1     |
| T18 | component/manual | 可访问性与大数据             | 键盘排序、焦点、读屏标签、38 词义/38 例句                         | 控件有可访问名；新增/错误聚焦可预测；折叠内容不造成明显全量重渲染     | P1     |
| T19 | e2e              | `center` 四步发布主流程      | admin route mock + contract-shaped words mock                     | 从列表创建，经四步提交，回列表看到 published，查看进入 V2 preview     | P0     |
| T20 | e2e              | 阻断与恢复关键支线           | duplicate；中途刷新；保存失败后重试                               | duplicate 不可继续；刷新恢复；失败保值且成功后推进                    | P1     |

## 执行约束

- 所有 P0 均自动化；视觉细节和真实浏览器缩放补手工检查。
- API client 先跑 contract/unit；admin 先跑纯模型与 mock，再跑组件/路由，最后跑 admin E2E。
- 覆盖率按仓库现有阈值执行，不降低阈值、不把新增逻辑加入排除项。

## 实施验证（2026-08-02）

- T01–T18 已由 contract、unit、component、integration 与 build 测试覆盖；全仓 `pnpm test:cov` 通过 91 个测试文件、939 个用例。
- 全仓覆盖率为 Statements 97.91%、Branches 93.36%、Functions 97.66%、Lines 99.31%，未调整阈值或排除新增逻辑。
- T19–T20 已落地 admin Playwright 场景；实现阶段运行 3/3 通过，最终合并门禁交由 CI 执行。
- 已在 1280px 真实浏览器视口手工检查主流程、保存后刷新恢复、方言双栏和长表单布局；页面宽度与视口一致，无横向溢出。
