# 基本词性目录对齐产品原型与"基础词性"规则 技术设计文档

## 方案概述

后端在 `catalog.parts_of_speech` 增加两列 `short_name_zh`（简洁显示）、`full_name_en`（英文全称），
NOT NULL + 唯一索引；"基础词性"不落库，而是后端用固定编码集合
`{noun, verb, pronoun, adjective, adverb}` 派生出布尔字段 `sub_parts_extensible`，
同时下发到管理列表项与 catalog 项，并在创建细分词性时拦截非基础父级。
前端严格按 wire 镜像新增字段，管理页表格/表单展示与录入两个新字段，
「细分词性」Tab 与 V3 向导都只依据 `sub_parts_extensible` 决定能否选择细分词性，
不在前端硬编码五个编码。

备选方案与不选原因：

- **落库一列 `is_basic`** —— 多一个可被误改的状态；规则本身是产品固定口径，派生更稳，
  与现有 `allowed_form_types` 按 code 派生的做法一致。
- **只在前端过滤父级下拉** —— 绕过前端即可写入违规数据，本地库已经因此出现脏数据，必须后端拦截。
- **保留 11 个种子只约束细分词性** —— 评审拍板不保留六个非基础种子（测试服会同样清空后再迁移），所以迁移直接把它们连同细分词性下线；管理员以后按需自建非基础词性。

## 契约依据

- `../tsz-rust/docs/openapi.json`（权威）、`docs/part-of-speech-config-design.md` §3/§6、
  `docs/frontend-integration.md` §7。
- 前端快照 `packages/api-client/src/openapi.snapshot.json`，由 `pnpm --filter @tsz/api-client sync:openapi` 同步。
- 现状核对（2026-09-06）：`PartOfSpeechConfig` 字段为 code / name_zh / name_en / abbreviation /
  sort_order / usage_count / sub_part_count / allowed_form_types / default_form_types / revision /
  created_by / created_at / updated_by / updated_at；`create_sub_part` 只校验父级存在；
  种子 11 个基本词性 + 19 个细分词性，其中 6 个细分词性挂在非基础词性下（PREP/CONJ/DET/ART/NUM/INT）。

## 代码影响范围

### `packages/types`

- `src/part-of-speech.ts`
  - `PartOfSpeechConfig` 新增 `short_name_zh: string`、`full_name_en: string`、`sub_parts_extensible: boolean`；
  - `PartOfSpeechCatalogItem` 新增同名三个字段；
  - `CreatePartOfSpeechInput` / `UpdatePartOfSpeechInput` 新增 `short_name_zh`、`full_name_en`（必填）。
  - 细分词性四个类型（`SubPartOfSpeechConfig`、`SubPartOfSpeechCatalogItem`、`CreateSubPartOfSpeechInput`、`UpdateSubPartOfSpeechInput`）新增 `short_name_zh`、`abbreviation`、`full_name_en`（评审后追加）。

### `packages/api-client`

- 后端 `docs/openapi.json` 更新后执行 `sync:openapi`，刷新 `openapi.snapshot.json`；
  `endpoints.contract.test.ts` 已无词性 PENDING 条目，快照 diff 即为契约变化证据。
- `src/admin.ts` 端点路径不变；无需改请求封装。
- `src/http.ts` 无改动：新错误码沿用 RFC 9457 `code` 分支，前端按稳定 code 映射。

### `apps/admin`

- `features/dictionary/part-of-speech/PartOfSpeechSettings.tsx`
  - 列：在「正式中文」后插入「简洁显示」(`short_name_zh`)，在「英文缩写」后插入「英文全称」(`full_name_en`)；
  - 「细分词性」列：`sub_parts_extensible === false` 时渲染"不可扩展"，否则沿用 `${count} 项`；
  - 「细分词性」Tab 的「所属基本词性」下拉：只保留 `sub_parts_extensible` 的目录项；过滤后为空时显示空态；
  - `errorMessage`：新增 `sub_part_of_speech_not_allowed → "该基本词性不支持细分词性"`；
  - `scroll.x` 按新增两列重算。
- `features/dictionary/part-of-speech/PartOfSpeechFormModal.tsx`
  - 新增两个 `Form.Item`：「简洁显示」（required、whitespace、max 16）、「英文全称」（required、whitespace、max 64）；
  - 回填与提交带上两个字段（create/update 都传）；
  - `onSaved` 改为回传整个已保存的 `PartOfSpeechConfig`，Settings 据 `sub_parts_extensible` 决定是否跳到细分词性 Tab（非基础词性新增后留在基本词性 Tab）。
  - 弹窗优化（评审后追加）：宽 720 两列排布（正式中文/简洁显示、正式英文/英文缩写、英文全称整行）；新建时简洁显示跟随正式中文、英文全称取正式英文小写，用户手动改过的字段不再覆盖。稳定编码与排序值都不暴露给用户：编码在提交时由英文全称派生（基本：小写下划线，非字母开头补 `p_`；细分：`<父级编码>-<英文全称>` 折成大写连字符——带父级前缀是因为编码全局唯一而英文全称只在父级内唯一，不同父级允许同名细分词性），排序值自动取目录（细分：该父级）最大排序值 + 10；目录未就绪时「新增」按钮禁用，避免算出错误排序值；修改时二者沿用原值。英文全称须含英文字母（否则派生不出合法编码）。编码撞车（后端 409 且 `field=code`）提示"英文全称与已有词性过于接近，请调整英文全称"；其他字段撞车按后端 `field` 提示"简洁显示与已有基本词性重复"等，缺 `field` 时退回"基本词性名称已存在"。细分词性弹窗同样处理。
  - 删除拦截（评审后追加）：基本词性下仍有细分词性时不允许删除——前端禁用「删除」并提示"还有 N 项细分词性，请先删除细分词性"，确认框文案改为"该操作不可恢复"；后端 `delete_part` 在引用检查后增加细分词性计数检查，返回 409 `part_of_speech_has_sub_parts`，前端映射为"该基本词性下还有细分词性，请先删除细分词性"。数据库外键同步由 `ON DELETE CASCADE` 改为 `ON DELETE RESTRICT`（迁移 `20260906160000_sub_parts_parent_restrict`），与服务层检查口径一致，绕过服务层直删也会被拒。
- `features/dictionary/part-of-speech/SubPartOfSpeechDrawer.tsx`
  - 面板去掉卡片标题栏，「新增细分词性」按钮挪到设置页「所属基本词性」选择器行右侧（评审后追加的布局要求，「新增基本词性」同样挪到搜索栏行右侧）；
  - 面板通过 `ref` 暴露 `openCreate` 句柄给设置页，弹窗与编辑态仍由面板自管；非扩展父级时 `openCreate` 直接忽略（防御，正常路径下拉已过滤）。
  - 父级下拉默认「全部」：面板接收 `parents[]`，用 `useSubPartOfSpeechLists`（`useQueries` 合并多个父级的列表，缓存键与单父级共用）拼成一张表并多一列「所属基本词性」，行操作按各自 `part_of_speech_id` 走；「全部」下「新增细分词性」照常可用，弹窗顶部多一个「所属基本词性」下拉（只列可扩展的基础词性，必选）；选中具体词性后新建时该下拉自动带上并锁定，修改时锁定为该行所属词性；排序值按所选父级自动追加在末尾。
  - 细分词性表按原型重排（评审后追加）：序号 / 正式中文 / 简洁显示 / 正式英文 / 英文缩写 / 英文全称 / 所属基本词性 / 引用 / 创建人 / 创建时间 / 操作；「所属基本词性」列始终显示；表单新增三个必填项；行操作按钮与基本词性表一致。
  - 细分词性表前端分页（评审后追加）：接口按父级整页返回、无分页信息，「全部」视图合并后行数变多，前端加 antd 分页（每页 10 / 20 / 50、共 N 条），序号按页偏移连续，切换父级回到第一页；不动后端。
- `features/dictionary/part-of-speech/catalog.ts`
  - `subPartOfSpeechOptions` / `soleSubPartOfSpeechCode` 对非扩展词性直接返回空/undefined，不依赖 `sub_parts` 是否为空；
  - Tab 下拉的过滤只是一行 `filter(item => item.sub_parts_extensible)`，直接写在 Settings 里，不另抽 helper。
- `features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.tsx`（约 L1795–1960）
  - 释义卡片的细分词性 `Select` 仅在 `catalogByCode.get(code)?.sub_parts_extensible` 为 true 时渲染；
  - 非扩展词性且 `sense.sub_pos` 非空时，渲染只读文本（沿用现有 `visibleSubPos` 逻辑），不改动数据。
- `features/dictionary/mock/adminWordsMock.ts` 与其 fixture：词性种子补齐三个新字段；
  mock 的 `createSubPart` 对非扩展父级返回 `sub_part_of_speech_not_allowed`，与真实契约一致。
- 测试：`PartOfSpeechFormModal.test.tsx`（必填校验、回填、提交载荷）、`PartOfSpeechSettings.test.tsx`
  （新列、"不可扩展"、下拉过滤、新错误码）、`SubPartOfSpeechDrawer.test.tsx`（禁用态）、
  `catalog.test.ts`（新 helper）、V3 向导相关测试（字段显隐、只读回显）。

### 已完成（本分支已含）

- 表格列名改为「正式中文」「正式英文」，去掉「稳定编码」列，行操作按钮去图标；表单标签同步；测试已更新。

## 后端对接（需转达 / 授权后实现，tsz-rust）

### 数据库迁移（新迁移文件，不改已应用的迁移）

1. `ALTER TABLE catalog.parts_of_speech ADD COLUMN short_name_zh TEXT, ADD COLUMN full_name_en TEXT;`
2. **下线六个非基础种子**：先删非基础词性下的全部细分词性，再按固定 UUID 删除介词、冠词、限定词、连词、数词、感叹词六个种子基本词性；被词条引用时外键 RESTRICT 让迁移硬失败（本地与测试服都先清空词条数据）。
3. **幂等重建种子**：对 5 个固定 UUID 基础词性 `INSERT ... ON CONFLICT (id) DO UPDATE SET short_name_zh = EXCLUDED.short_name_zh, full_name_en = EXCLUDED.full_name_en`
   已知边界：按 `id` 冲突而不按 `code`，若某环境把固定种子删掉又用同一 `code` 新建（id 不同），重跑种子会撞 `code` 唯一索引；本次测试服与本地都整库清空后重建，不触发。
   ——本地目录已被清空，必须能在空表上重新种入；测试服上则只补两列。种子值：

   | code      | short_name_zh | full_name_en |
   | --------- | ------------- | ------------ |
   | noun      | 名词          | noun         |
   | pronoun   | 代词          | pronoun      |
   | verb      | 动词          | verb         |
   | adjective | 形容词        | adjective    |
   | adverb    | 副词          | adverb       |

   同理幂等重建五个基础词性下的 13 个种子细分词性（沿用 `20260810080727` 里的固定 ID）。

4. 非种子存量行回填：`short_name_zh = name_zh`，`full_name_en = lower(name_en)`；回填后若撞唯一索引，迁移失败并列出冲突行。
5. `SET NOT NULL`，加 CHECK（trim、长度 1–16 / 1–64）与唯一索引
   `catalog_parts_of_speech_short_name_zh_unique_idx`、`catalog_parts_of_speech_full_name_en_unique_idx (lower(full_name_en))`
   ——索引名进入错误映射契约，冲突统一映射 409 `part_of_speech_conflict`，`meta.field` 标明字段。
6. `bump_version`：迁移结束后递增 `catalog.metadata` 版本，让前端 5 分钟缓存自然失效。
7. down 迁移：删两列、CHECK 与索引；被删的六个基本词性与细分词性种子不自动恢复（备份见风险与回滚）。
8. 迁移文件：`migrations/20260906120000_pos_short_full_names_and_basic_rule.{up,down}.sql`；规则模块 `src/catalog/rules.rs`；错误码 `sub_part_of_speech_not_allowed`（409）。

### 细分词性展示字段（评审后追加）

迁移 `20260906150000_sub_pos_display_fields`：`catalog.sub_parts_of_speech` 增加 `short_name_zh`、`abbreviation`、`full_name_en`
三个 NOT NULL 列；13 个种子按固定 ID 补齐；存量自建行回填（简洁显示取正式中文、缩写沿用所属基本词性的缩写、英文全称取正式英文小写）；
简洁显示与缩写允许同父级重复（原型里多个名词短语共用 n.），英文全称同父级忽略大小写唯一
（`catalog_sub_parts_full_name_en_unique_idx`，冲突映射 409 `sub_part_of_speech_conflict` 且 `field=full_name_en`）。
请求 `CreateSubPartRequest` / `UpdateSubPartRequest` 三个字段必填，同批部署约束同基本词性。

### 连带修正：V3 检测的建议词性按目录过滤

六个非基础种子下线后，内置词典把供应商词性映射成 `preposition` 等编码时目录里已没有对应行。
V2 检测（`lexicon/service/entry.rs`）本来就用 `catalog_parts` 只保留目录现存编码，V3 检测
（`lexicon/service/v3.rs` 的 `builtin_suggested_pos`）没有过滤，会建议出无法保存的 pos。本批把 V3 也改成
先过 `catalog_parts` 再生成建议，并加集成测试 `v3_detection_drops_suggested_pos_missing_from_catalog`。

### 模型与 API

- `PartOfSpeechConfig`、`PartOfSpeechCatalogItem` 增加 `short_name_zh`、`full_name_en`、`sub_parts_extensible`；
  `CreatePartOfSpeechRequest` / `UpdatePartOfSpeechRequest` 增加两个必填字符串，沿用 `normalized_text` 规则。
- `sub_parts_extensible` 由 `catalog::rules::is_basic_part_of_speech(code)` 派生，集合固定为五个编码，放在与
  `lexicon::form_types` 同层的规则模块并加单测。
- `create_sub_part`：在 `part_revision` 存在性检查后，取父级 code；非基础词性返回新错误
  `CatalogServiceError::SubPartNotAllowed` → HTTP 409 `sub_part_of_speech_not_allowed`，`meta.part_of_speech_id` 与 `meta.code` 带上父级。
  （状态码若后端倾向 422 也可，前端只按 code 分支。）
- `update_part` 不允许改 code，因此扩展性不会因修改而变化，无需额外校验。
- OpenAPI：`docs/openapi.json` 同步更新 schema 与 409 响应示例；`frontend-integration.md` §7 补一段规则说明。

### 部署顺序

- 响应新增字段：词性接口不在严格运行时 schema 内，后端先上不打坏旧前端。
- 请求新增必填字段：后端先上会让旧前端的新增/修改基本词性返回 422。结论：**前后端同批部署**
  （先后端迁移，紧接着发前端），中间窗口只影响超级管理员的词性写操作，可接受；
  若需要更宽松，后端可在一个版本内把两字段设为可选并回填默认值，前端上线后再收紧。

## 复用与约定

- 类型只进 `@tsz/types`，snake_case 直出；请求层不加转换。
- 目录查找/选项生成继续集中在 `part-of-speech/catalog.ts`，新增 helper 而非在页面里散写过滤逻辑。
- 错误提示按稳定 `code` 分支（`errorMessage`），不匹配 `detail` 文案。
- antd v6：新增 `Form.Item` 校验规则与现有字段同风格；表格新增列后重算 `scroll.x`；测试避免对大表用 `getByRole`。
- 不在前端出现 `noun`/`verb` 等编码字面量作为规则依据（测试 fixture 除外）。

## 数据流 / 时序

1. 打开词性配置页 → `GET /settings/parts-of-speech` → 表格渲染新列，`sub_parts_extensible=false` 的行显示"不可扩展"。
2. 新增基本词性 → `POST /settings/parts-of-speech`（含 `short_name_zh`、`full_name_en`）→ 201 → 失效 `partOfSpeechKeys.all` → 列表与 catalog 同步刷新。
3. 细分词性 Tab → `GET /settings/parts-of-speech/catalog` → 下拉只列 `sub_parts_extensible=true` 项 → 选定后
   `GET /{id}/sub-parts` → 新增 `POST /{id}/sub-parts` → 201；父级非基础时 409 `sub_part_of_speech_not_allowed` → 页面提示、表单保留。
4. V3 向导词义步 → catalog 由 `usePartOfSpeechCatalog` 提供 → 按 `sub_parts_extensible` 决定细分词性字段显隐；保存/发布载荷不变。

## 测试策略（概览）

- **契约**：`sync:openapi` 后快照 diff 只包含三个新字段与一个新错误响应；契约测试全绿。
- **单测（admin）**：表单必填/长度校验与提交载荷；表格新列与"不可扩展"；下拉过滤与空态；新错误码提示；
  V3 向导字段显隐与只读回显；catalog helper 对非扩展词性返回空。
- **后端**（若由本会话实现）：规则模块单测；`create_sub_part` 拒绝非基础父级；迁移在空表与已有种子两种库上各跑两次幂等；违规引用存在时迁移失败。
- **手测**：本地 `cargo run` + admin dev：新增基础/非基础词性 → 各自尝试加细分词性 → 向导中释义子词性字段显隐 → 刷新后数据仍在。
- 具体用例矩阵在动工阶段用 test skill 产出 `test-matrix.md`。

## 风险与回滚

- **测试服存量违规数据**导致迁移失败：部署前先查引用数并人工清理；这是有意的硬失败，不做静默跳过。
- **唯一索引回填冲突**（如两个自建词性 `name_en` 只差大小写）：迁移失败并列出冲突行，人工改名后重跑。
- **同批部署窗口**内旧前端写操作 422：窗口极短且只影响超管；如不可接受走"先可选后收紧"两步。
- **前端硬编码诱惑**：五个编码只允许出现在后端规则模块与测试 fixture；代码评审据此把关。
- **回滚**：前端回退到上一版本即可（不读新字段）；后端 down 迁移删列与索引；被删细分词性只能从备份恢复
  （本地备份：会话 scratchpad `local-catalog-lexicon-backup-20260906-094359.sql`；测试服部署前先 `pg_dump -n catalog -n lexicon`）。
