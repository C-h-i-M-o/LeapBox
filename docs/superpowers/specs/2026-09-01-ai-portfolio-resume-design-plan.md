# AI 开发者作品集滚动叙事优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Do not use subagents without the user's explicit permission.

**Goal:** 将现有 `/resume` 优化为暗色、克制、具有电影感的双语 AI 开发者作品集，通过分段固定与滚动驱动的局部变化改善阅读节奏。

**Architecture:** 保留现有 Vinext + Vite + React 公开路由和本地媒体资源。页面内容继续由强类型中英文数据驱动，`.tsx` 只负责 UI 组合，GSAP ScrollTrigger 行为集中在 TypeScript Hook 与纯计算模块中；不新增后端接口或数据写入。

**Tech Stack:** React 19、TypeScript 5.9、Vinext、Vite 8、GSAP 3、`@gsap/react`、CSS。

**Spec:** 本文第 1—9 节为规格，第 10 节为实施与验证计划。

## Global Constraints

- 在当前未提交工作区增量开发，不创建分支、不提交、不推送。
- 不使用 sub agent。
- 不修改数据库、D1、R2、API、登录流程或 `/leapbox` 行为。
- 默认中文，支持完整英文切换；两种语言的信息结构保持一致。
- 不公开手机号、课程分数，不提供简历下载功能。
- 企业项目只展示已批准公开、脱敏后的技术方法。
- `.tsx` 只负责 UI、组件组合与导入；交互逻辑放入 `.ts`。
- 新增 TypeScript 使用完整类型，非必要不使用 `any`。
- 页面面向 PC 端，版心最大宽度约 `1700px`。
- 不实现 `prefers-reduced-motion` 分支。
- 页面运行时只使用现有本地图片和视频，不引用提示词文件中的远程素材。

---

## 1. 体验目标与视觉方向

视觉方向采用已确认的 **A｜克制电影感**：

- 主背景为近黑色，文字为暖白，冷绿色只用于状态与交互提示。
- 使用编辑式衬线大标题、理性无衬线正文、细边框、颗粒和低对比扫描线。
- 页面仍由自然纵向滚动驱动，但 Hero、个人经历、获奖、项目和个人优势在关键区间固定停留。
- 滚动只改变当前模块中的视频、人物图、文字层、圆环、项目卡片或能力项，不使用生硬的整页吸附。
- 动画以 `transform` 与 `opacity` 为主，避免持续改变布局属性。

## 2. 页面结构与滚动行为

### 2.1 Hero

- 全屏视频背景、导航、大标题和两个联系入口。
- 品牌标识使用 `YL`。
- 保留标题“把 AI 的不确定 / 变成可以验证的产品。”及对应英文。
- 删除“目前就读于东华大学，同时参与企业级 AI 简历平台研发”及英文对应内容。
- Hero 在首段滚动中短暂停留；视频轻微放大，标题两行产生差速位移，信号线移动。

### 2.2 关于与经历

- 模块固定约三个视口滚动距离。
- 左侧显示本地抽象人物线稿；滚动时改变缩放、纵向位置和扫描线位置。
- 右侧依次切换三组状态：个人介绍、实习经历、教育经历。
- 教育信息只展示绩点与排名，不展示课程分数。
- 原四列统计表完全删除。
- 固定段结束后显示双排反向循环技术关键词：
  `LLM Evaluation · RAG · Agent · Elasticsearch · React · TypeScript · FastAPI · MySQL`。

### 2.3 获奖经历

- 独立整屏固定模块，九项奖项构成立体无限圆环。
- 圆环默认缓慢循环；滚动方向与速度影响圆环旋转方向和速度。
- 鼠标悬停或键盘聚焦奖项时暂停，当前奖项提高对比度和景深。
- 所有奖项保留为可访问文本节点。

### 2.4 精选项目

- 三张项目卡片采用 sticky 堆叠，而非普通网格列表。
- 卡片进入时改变图像裁切、封面位移、编号和文字透明度；向上滚动时可逆。
- EvalSpark 不展示“10.360s 降至 4.896s”或其他耗时成果。
- Resume Intelligence 与 Git Development Reporter 保留已批准的非量化成果。

### 2.5 个人优势

- 左侧标题固定，右侧四项能力随滚动逐项成为主状态。
- 非当前项降低透明度并缩小；当前项显示说明与技术标签。

### 2.6 联系收尾

- 整屏自然收尾，不再额外固定。
- 仅提供邮件、GitHub 与所在地上海。
- 不展示手机号，不提供简历下载入口。

## 3. 已确认中文内容

### 3.1 关于与经历

- 个人介绍标题：`在模型能力与真实业务之间，搭一座能落地的桥。`
- 个人介绍：`我是刘逸伦，一名 AI 开发者和软件工程本科生。我的工作横跨大模型应用、前端体验、后端服务与数据检索，更关注系统如何被验证、解释并持续交付。`
- 实习：`2026.07 — 至今`，`上海艾杰飞人才管理咨询有限公司`，`全栈开发工程师（侧重前端）`。
- 实习说明：`参与企业级简历管理平台与浏览器插件研发，覆盖 AI 简历解析、Elasticsearch 检索与精准高亮等核心链路。`
- 教育：`2024.09 — 2028.06`，`东华大学 · 双一流 / 211`，`软件工程本科`。
- 教育说明：`专业绩点 3.670/5.0，排名 14/84（前 17%）。`

### 3.2 获奖经历

1. `2024.12｜CACC 上海市二等奖`
2. `2024.12｜东华大学程序设计新人邀请赛银奖`
3. `2025.03｜入党积极分子培训班主题讨论第三名`
4. `2025.05｜第十六届蓝桥杯上海赛区 C/C++ 程序设计大学 A 组二等奖`
5. `2025.05｜东华大学数学竞赛二等奖`
6. `2025.05｜金马五校程序设计竞赛铜奖`
7. `2025.07｜中国大学生程序设计竞赛（CCPC）上海市赛铜奖｜队长`
8. `2025.12｜东华大学一等奖学金`
9. `2025.12｜东华大学优秀学生干部`

### 3.3 精选项目

- `EvalSpark｜AI 评测实验室`：为模型、RAG 与 Agent 应用建立统一评测依据，整合规则评分、三轮 LLM-as-a-Judge 与用户反馈，覆盖内容质量、格式、安全、忠实度和工具调用。
- `Resume Intelligence｜企业级 AI 简历工程`：将非结构化 PDF 转换为符合业务 Schema 的结构化数据，并优化 Elasticsearch 检索链路，由后端统一返回命中区间，前端按区间高亮。成果为打通简历解析、检索、高亮与入库的完整链路。
- `Git Development Reporter｜Agent 工程化 Skill`：将 Git log、diff 与验证结果转化为结构化开发汇报。Agent 根据提交 ID 自动整理需求、实现、影响范围及测试证据。成果为从代码提交直接生成可复用的开发报告。

### 3.4 个人优势

1. `AI 应用构建`：熟悉 Prompt Engineering、RAG、Agent、Embedding、Tool Calling 与 OpenAI-compatible API，具备多模型调度和 AI 应用评测实践。
2. `全栈工程交付`：使用 React、TypeScript、Next.js、FastAPI 与 Node.js 完成产品开发、接口联调和功能落地。
3. `检索与数据处理`：熟悉 MySQL、SQL 与 Elasticsearch，具备结构化数据处理、关键词检索和系统集成经验。
4. `工程化思维`：熟悉 Git 协作、项目部署和前端工程化工具，关注功能验证、代码质量与可持续交付。

### 3.5 联系方式

- 标题：`有值得验证的想法，/ 我们可以从一次对话开始。`
- 说明：`如果你正在寻找 AI 应用、全栈开发或检索工程方向的合作伙伴，欢迎与我联系。`
- 邮箱：`liuyilun0603@163.com`
- GitHub：`github.com/C-h-i-M-o`
- 所在地：`上海`

英文版使用英文简历中的对应表述或忠实翻译，不增加新事实。

## 4. 数据结构与接口

`resume-content.ts` 继续导出：

```ts
export type ResumeLocale = "zh" | "en";
export const resumeContent: Record<ResumeLocale, ResumeContent>;
```

新增或调整数据结构：

```ts
export type AwardContent = {
  period: string;
  title: string;
  distinction?: string;
};

export type ProjectContent = {
  number: string;
  title: string;
  category: string;
  description: string;
  outcome?: string;
  stack: readonly string[];
  image: string;
  imageAlt: string;
  href?: string;
};
```

`ResumeContent` 删除 `hero.availability`、`about.stats` 与 `ResumeStat`，新增：

```ts
about: {
  techStack: readonly string[];
  // 保留个人介绍、联系信息与 timeline
};
awards: {
  sectionLabel: string;
  title: string;
  introduction: string;
  items: readonly AwardContent[];
};
```

新增纯计算模块接口：

```ts
export function getAwardRingRotation(index: number, total: number): number;
```

- `getAwardRingRotation` 将奖项均匀放置在 `360°` 圆环上。

## 5. 组件与文件边界

| 文件 | 职责 |
| --- | --- |
| `app/(public)/resume/resume-content.ts` | 强类型中英文内容、技术栈、奖项与公开链接 |
| `app/(public)/resume/resume-sections.tsx` | Hero、关于、奖项、项目、优势、联系纯 UI |
| `app/(public)/resume/resume-portfolio.tsx` | 页面区块组合、语言与动画 Hook 接入 |
| `app/(public)/resume/resume-motion-model.ts` | 奖项圆环角度纯计算 |
| `app/(public)/resume/use-resume-motion.ts` | GSAP 时间线、ScrollTrigger、悬停/聚焦暂停与清理 |
| `app/(public)/resume/resume.css` | 暗色电影感视觉、固定段、圆环、堆叠和桌面布局 |
| `tests/resume-content.test.ts` | 双语内容、隐私和确认文案契约 |
| `tests/resume-motion-model.test.ts` | 圆环角度纯函数测试 |
| `tests/rendered-html.test.mjs` | `/resume` 服务端渲染、分层结构与关键行为契约 |

## 6. GSAP 实现约束

- `gsap.registerPlugin(useGSAP, ScrollTrigger)` 只注册一次。
- 所有选择器通过 `useGSAP({ scope: rootRef })` 限定到作品集根节点。
- ScrollTrigger 按页面从上到下创建，固定元素只固定外层，动画发生在子元素。
- 滚动时间线使用 `scrub`，不同时使用 `toggleActions`。
- 关于、获奖和优势分别使用独立顶层时间线；Hero 只播放入场动画，不固定首屏。
- 项目卡片使用 CSS `position: sticky` 管理堆叠，GSAP 只负责卡片内部 transform/opacity。
- 圆环无限动画在离开视口时暂停，进入时恢复；组件卸载或语言切换时完整清理。
- 高频滚动更新只改变 `rotationX/rotationY`、`opacity` 或 CSS transform。
- 图片和字体影响布局后只执行必要的 `ScrollTrigger.refresh()`。

## 7. 无障碍、隐私与安全

- 导航、按钮和外链保留可见焦点状态。
- 奖项悬停与键盘焦点具有相同的暂停和高亮行为。
- 外链使用 `target="_blank"` 与 `rel="noreferrer"`。
- 页面不出现手机号、课程分数或简历下载 URL。
- 不新增表单、分析请求、第三方运行时资源或数据库操作。

## 8. 响应范围

- 重点验收 `1440×900` 与 `1920×1080`。
- `1180px` 以下取消复杂固定与 3D 圆环，降级为可自然阅读的纵向布局。
- `760px` 以下保证不横向溢出，但不制作独立移动端产品设计。

## 9. 验收标准

1. 匿名访问 `/resume` 返回 `200`，中英文切换正常。
2. 品牌标识为 `YL`，Hero 不再显示已删除的就读说明。
3. 原四列统计表不存在，技术关键词双排反向循环。
4. 关于模块固定并依次展示个人、教育、实习三组内容，技术轨道始终位于固定视口底部。
5. 教育内容不含课程分数，九项奖项完整且中英文数量一致。
6. 获奖圆环以固定速度和方向持续循环，仅在鼠标悬停或键盘聚焦时暂停。
7. 三个项目以 sticky 卡片堆叠；EvalSpark 不含耗时成果。
8. 四项个人优势随滚动逐项成为主状态。
9. 联系区只有邮箱、GitHub 与上海，无手机号和简历下载。
10. GSAP 在语言切换和卸载时无重复触发器或控制台错误。
11. 类型检查、单元测试、契约测试、生产构建与 Lint 通过。
12. `/leapbox`、API、数据库与迁移文件不产生本轮差异。

## 10. 实施任务与验证计划

### Task 1：内容与类型契约

**Files:**

- Modify: `tests/resume-content.test.ts`
- Modify: `app/(public)/resume/resume-content.ts`

**Interfaces:** Produces updated `ResumeContent`, `AwardContent`, and optional `ProjectContent.outcome`.

- [x] 在测试中断言九项双语奖项、无课程分数、无 Hero 就读说明、无 EvalSpark 耗时、技术词数组和联系方式边界。
- [x] 运行 `node --experimental-strip-types --test tests/resume-content.test.ts`，确认旧内容导致断言失败。
- [x] 最小修改中英文类型与内容，使内容测试通过。

### Task 2：圆环纯计算

**Files:**

- Create: `tests/resume-motion-model.test.ts`
- Create: `app/(public)/resume/resume-motion-model.ts`
- Modify: `package.json`

**Interfaces:** Produces `getAwardRingRotation(index, total)`.

- [x] 测试 `9` 个奖项的相邻角度为 `40°`，无效总数返回 `0`。
- [x] 将测试加入 `test:unit` 并运行，确认模块缺失导致失败。
- [x] 实现最小纯函数并确认测试通过。

### Task 3：页面语义结构

**Files:**

- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/(public)/resume/resume-sections.tsx`
- Modify: `app/(public)/resume/resume-portfolio.tsx`

**Interfaces:** Consumes updated `ResumeContent`; produces `AwardsSection`, pinned-stage attributes, tech rails, sticky projects, and strengths states.

- [x] 新增渲染/源码契约，覆盖 `YL`、`#awards`、九项奖项、技术轨道、固定段与 sticky 数据属性，并禁止旧统计类和下载入口。
- [x] 运行目标测试，确认旧 UI 结构失败。
- [x] 更新纯 UI 组件与组合顺序，使渲染/源码契约通过。

### Task 4：滚动交互

**Files:**

- Modify: `app/(public)/resume/use-resume-motion.ts`

**Interfaces:** Consumes data attributes and motion model; produces GSAP behavior for Hero, About, Awards, Projects, Strengths, and Contact.

- [x] 为行为源契约补充 pin、scrub、圆环无限循环、进入/离开暂停以及事件清理断言，并确认旧实现失败。
- [x] 按页面顺序建立顶层时间线，使用 `useGSAP` scope 和 cleanup。
- [x] 运行目标测试并确认通过。

### Task 5：克制电影感样式

**Files:**

- Modify: `app/(public)/resume/resume.css`

**Interfaces:** Consumes new semantic structure and GSAP transforms; produces the desktop-first visual system.

- [x] 先在源码契约中加入关键布局断言，并确认旧样式失败。
- [x] 实现桌面优先样式；只对实际动画元素设置 `will-change`。
- [x] 为 `1180px` 与 `760px` 以下提供自然阅读降级。
- [x] 运行渲染契约与 Lint。

### Task 6：完整验证与真实浏览器验收

**Files:** Modify only if verification reveals a requirement-related defect.

- [x] 运行 `npm test`。
- [x] 运行 `npm run lint`。
- [x] 运行 `git diff --check` 与 `git status --short`。
- [x] 启动或复用本地服务，检查 `/resume`、语言切换、锚点、外链和控制台。
- [x] 在 `1440×900` 与 `1920×1080` 检查 Hero、关于、奖项、项目、优势和联系区。
- [x] 核对 `/leapbox` 与数据库相关路径未被本轮修改。

## 11. 自检结果

- 规格覆盖：所有已确认文案、三条浏览器批注、奖项图片补充、A 视觉方向、国际化与隐私要求均映射到实施任务。
- 占位检查：本文不包含占位描述。
- 类型一致：`AwardContent`、可选 `outcome` 和两个纯计算函数在数据、组件、动画与测试任务中命名一致。
- 范围检查：本轮不引入新依赖、不生成新媒体、不改 API 或数据库。

## 12. 实施结果

- `/resume` 已完成 Hero、关于、奖项、项目、优势和联系方式六段滚动叙事重构。
- 关键内容先通过失败测试锁定，再完成实现：内容与圆环计算目标测试均经历红—绿过程。
- `npm test` 通过：62 项单元测试、3 项迁移测试、5 项接口契约测试、生产构建与 13 项渲染测试全部完成。
- `npm run lint` 退出码为 `0`，无错误；保留两条本地 `<img>` 的框架优化建议。
- 真实浏览器已验证三状态经历切换、奖项圆环循环及悬停暂停、项目堆叠、优势切换、双语重建、联系方式与隐私边界。
- `1440×900` 与 `1920×1080` 均无横向溢出，浏览器控制台无警告或错误。

## 13. 第二轮反馈：规格与实施计划

### 13.1 已确认的交互定义

- “首屏不需要悬停”定义为 Hero 不再由 ScrollTrigger 固定；保留首次进入时的文字入场动画与视频背景。
- Hero 内容区移除“查看精选项目”和“开始对话”，导航栏联系入口继续保留。
- 经历固定段采用参考截图的单屏构图：人物图位于左侧，当前内容位于右侧，双排技术轨道位于同一固定视口底部。
- 经历顺序固定为个人介绍、校园经历、实习经历，原大标题改为语义标题，不再占用桌面视觉空间。
- “经历圆环”按上下文定义为荣誉圆环：固定方向、固定速度自动循环；鼠标悬停或键盘聚焦时暂停，不再读取滚轮方向或速度。
- 导航栏“荣誉”锚点与荣誉固定段顶部对齐，不保留额外锚点偏移。
- 两个无公开链接的脱敏企业项目统一显示“实习项目”／“Internship Project”。
- 能力区增加一束随当前能力卡片移动的柔和光效，动画仅使用 transform 与 opacity。
- `/resume` 页面隐藏浏览器滚动条，但保留滚动能力。

### 13.2 数据结构与组件边界

- `ResumeContent.hero` 删除不再渲染的 `workLabel` 与 `contactLabel`。
- `about.timeline[0]` 为校园经历，`about.timeline[1]` 为实习经历；中英文保持一致。
- `resume-about-stage` 同时包含主内容与 `resume-tech-marquee`，主内容使用独立 `resume-about-main` 版心。
- `StrengthsSection` 新增无语义的 `data-strength-glow` 光效节点，内容卡片结构不变。
- `useResumeMotion` 删除 Hero 固定时间线及荣誉滚动速度映射，只保留进入视口播放、离开视口暂停、悬停／聚焦暂停。

### 13.3 验收标准

1. 首屏自然滚离，不产生 Hero pin spacer，两个 Hero 行动按钮不存在。
2. 经历固定段在 `1440×900` 和 `1920×1080` 中同时看见人物、当前经历与双排技术轨道。
3. 经历面板顺序为个人、校园、实习，标题不挤压主要内容。
4. 点击“荣誉”后荣誉固定段顶部与视口顶部对齐；圆环滚动速度和方向不受滚轮影响。
5. 鼠标悬停或键盘聚焦奖项时圆环暂停，离开后以原固定速度继续。
6. 两个无链接项目的提示准确显示“实习项目”，中英文切换一致。
7. 能力区活动卡片切换时光效同步移动，右侧系统滚动条不可见。
8. 单元测试、渲染契约、生产构建、Lint、差异检查与真实浏览器验证通过。

### 13.4 实施步骤

- [x] 先更新内容、结构与动效契约测试，运行并确认针对旧实现失败。
- [x] 调整双语内容、经历顺序和纯 UI 结构，使内容与结构测试通过。
- [x] 精简 GSAP 时间线，加入能力光效同步动画，使行为契约通过。
- [x] 调整桌面与响应式 CSS，完成经历同屏布局、准确锚点和隐藏滚动条。
- [x] 运行完整自动化验证，并在两个目标视口逐项完成浏览器验收。

### 13.5 实施结果

- Hero 已取消固定滚动，固定段数量由四个减为三个；Hero 两个重复行动按钮已移除。
- 经历固定段严格限制为一屏高度，人物、当前面板和技术轨道在 `1440×900` 与 `1920×1080` 均可同时看到。
- 个人、校园、实习三个阶段均拥有稳定阅读区间；校园经历先于实习经历。
- 荣誉锚点实测顶部偏差为 `0px`；圆环以固定方向和速度运行，悬停暂停、离开恢复。
- 两个无公开链接项目在中英文下分别显示“实习项目”与“Internship Project”。
- 能力光效随活动卡片由第一项移动到第三项时，浏览器计算的 Y 位移由 `0px` 更新为 `361px`。
- 页面计算样式 `scrollbar-width` 为 `none`，两个目标桌面尺寸横向溢出均为 `0px`。
- `npm test` 通过：62 项单元测试、3 项迁移测试、5 项接口契约测试、生产构建与 13 项渲染测试全部完成。
- `npm run lint` 退出码为 `0`，无错误；保留两条本地 `<img>` 框架优化建议。`git diff --check` 通过。
