# 按具体词义关联：本地验收

2026-09-13，已完成本地实现与验收。适用当前 `requirements.md` / `design.md`；之前的 local/step3 验收文件记录上一轮词条级版本，不作为本轮契约依据。

## 环境与范围

- 前端：`/Users/darwish/Dev/tsz-core/tsz-sentence-senses-20260913`，`codex/shared-sentence-sense-targets`，`9ae727533ab159627d7c493e3eeb325574a552b2 + 工作区改动`。
- 后端：`/Users/darwish/Dev/tsz-core/tsz-rust-sentence-senses-20260913`，同名分支，`d5bddc49ed9c9b29aa2b1f3f2933ca8ce57f9e59 + 工作区改动`。
- 页面：<http://127.0.0.1:3102/words/01a09551-1747-7e81-9d8a-c751db933cf5/v3/wizard/meanings>。内置浏览器已打开并保留，用户可继续验收。
- 实际代理：3102 `/api/v1` → `127.0.0.1:8485/api/v1`。词条、词性目录、TTS mock 开关均为 false；验证码仍使用项目现有 Mock sender，此次不验收真实短信。
- PostgreSQL：本地 55441 的独立数据库 `tsz_sentence_senses_20260913`，来自旧本地库的副本。运行 Redis 为本地 56392/2；测试为 56392/15。
- 原 3101 与 8484 服务、原库和用户原来的未保存页面未改动。仅新环境应用迁移；未提交、推送或部署。

进程、二进制哈希、OpenAPI 哈希和 API 摘要见同目录 `sense-target-acceptance.json`。运行 API 的 OpenAPI 与指定后端生成物逐对象比对一致。最终 healthz 与新管理页均返回 200。

## 实际业务验证

| 风险                                 | 证据与结果                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新建义项未保存便写入关联             | 内置浏览器新增空白义项，显示“先保存词义，再添加例句”，添加按钮禁用。随后删除本次未保存空白义项，未写入词条。组件测试验证正常保存后的 canonical sense 使入口开放。              |
| 例句误归属整个词条                   | 在 make up 的“编造（故事、借口等）”里创建例句，API 和 SQL 都保存了完整 `target_sense_id=791d271a-d9f2-47cc-b411-8db2dcf0fce7`；词条 revision 仍为 7，句子独立 revision=1。     |
| 只存在前端缓存                       | 浏览器完成后刷新，重新读到相同例句及译文；同源代理 GET 与数据库返回同一 UUID `9f0ef4c9-2814-4638-b43a-6043d829d7bc`。                                                          |
| 同词不同义串行展示                   | 后端回归验证同一句不同片段绑定两个义项、两处返回同一 UUID，解除第一个义项后第二个保留，正文不变。同一 entry 下的其他 sense 不能代替当前上下文。                                |
| 关联只选择到词条、或短语被转到成分词 | 选择器测试验证依次选择词条、匹配词形、词义后才可确认；无成分用词的 make up 可以直接关联自己的“编造”义项。匹配方言不会再被管理员默认偏好过滤。                                  |
| 输入丢失                             | 浏览器修改译文后切换步骤，显示继续/放弃/独立保存三个选项；返回编辑与明确放弃流程可用，原保存译文保留。回归覆盖失败保存、重试及输入保留。                                       |
| 老标注被猜分配                       | 副本中的 19 条旧例句在全局仍可见，旧 entry-only 标注显示“待选择词义”。具体词义只返回明确修复或新建的有效关联。集成测试验证拒绝直接保存旧目标、补齐后仍为同一例句。             |
| 词形或版本变更破坏引用               | 真实 handler 回归覆盖词义删除、原形拼写改变、variant 身份裁剪、激活缺少义项的快照，均返回 409 reference_conflict。历史快照仍有义项、但当前已删除时，新建关联被拒且零部分写入。 |
| 译文/正文编辑体验退化                | 保留直开 voice-editor、初/中/高/高模板、过滤空译文、完整译文列表；改错再改回恢复完整关联身份的回归通过。浏览器保存的三个空译文模板没有落库。                                   |
| 迁移回退丢数据                       | 在新隔离库执行 up/down/up 后回滚事务成功；有新 sense target 时 down 被测试确认拒绝。旧数据不自动迁移到某个词义。                                                               |

## 检查结果

- 前端原生 `pnpm test:cov --maxWorkers=2`：175 文件，2609 passed / 2 skipped；包含仓库额外质量脚本。之前直接启动的 coverage 已停止，最终证据采用原生 runner。
- `pnpm typecheck` 与 `pnpm lint` 均通过；最后 admin typecheck/lint/build 通过。
- 最后词义摘要显示调整后，associationModel 与 SentenceEditor 定向检查 9 passed。
- `@tsz/api-client`：391 passed；指定新后端 OpenAPI 同步成功，source SHA256 为 `7a45ee034080ffa8e7556373c158155b34bbe80acddd7294fdf99b4fdd99d3c4`。
- 后端完整 `cargo test --locked --all-features`：890 passed / 1 ignored。之后补充的词形/历史版本保护测试通过；最终 shared_sentences 全 features 定向集成测试 19 passed。
- 后端最终 fmt/clippy 通过；`cargo sqlx prepare -- --all-targets --all-features` 通过，缓存没有差异。
- 独立审查发现的历史快照门禁、方言二次过滤、共享影响词义计数与过时契约说明均已修复，新增保护用例已固定。

## 留存与发布限制

保留浏览器创建的验收例句和新本地环境供用户验收；旧环境维持原样。旧关系必须人工选择词义或清除，不自动复制到每个义项。前后端新旧 wire 契约不能混用，后续发布需同批切换，仍须走各仓原生 ship/deploy 门禁。

后端定向复验（在新后端根目录、保持已记录的隔离连接）：

```sh
SQLX_OFFLINE=true REDIS_URL=redis://127.0.0.1:56392/15 TEST_REDIS_URL=redis://127.0.0.1:56392/15 cargo test --locked --all-features --test shared_sentences
```
