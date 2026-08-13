# 跃匣 LeapBox 私人文件管理应用设计说明（大文件与批量操作升级）

## 1. 目标与边界

“跃匣 LeapBox”是一个仅供站点所有者本人使用的私人文件管理 Web 应用。本次升级必须在现有真实存储能力上增加 5 GB 单文件分片上传、断点续传、文件夹上传与批量整理，并改善响应速度、视觉层级和交互动效，不使用模拟数据替代平台存储。

站点继续通过 Sites 的 ChatGPT 身份验证与访问策略保护。应用不实现自有账号体系，也不包含公开分享、多人协作、在线编辑、文件版本历史或付费能力。

## 2. 技术架构

- 前端：Vinext、React 19、TypeScript，使用服务端渲染的受保护入口和客户端文件管理器。
- 身份：页面通过 `requireChatGPTUser("/")` 发起登录，API 通过 `getChatGPTUser()` 返回 401；所有资源操作都使用服务端读取的 `userId`。
- 元数据：Cloudflare D1，逻辑绑定名为 `DB`；Drizzle 用于 schema 与迁移，业务查询使用 prepared statements。
- 文件内容：Cloudflare R2，逻辑绑定名为 `FILES`。对象键为 `objects/<uuid>`，不含原始文件名，也不出现在客户端数据或下载地址中。
- 本地浏览器存储：`localStorage` 只保存视图偏好；IndexedDB 只保存可恢复的上传进度。文件、目录、上传会话和操作状态的权威数据来自 D1/R2。

服务端按身份校验、输入校验、文件记录、目录关系、上传会话、R2 multipart、批量操作与 HTTP 路由划分职责。所有 API 先完成身份与所有权校验，再触碰元数据或对象。

所有文件统一走 R2 multipart 会话，避免 `request.formData()` 与 `file.arrayBuffer()` 将完整文件读入 Worker 内存。客户端使用 8 MiB 固定分片，默认并发 3 个分片；失败分片最多自动重试 3 次。服务端只接收一个分片的二进制流并交给 R2。客户端将会话 ID、文件指纹和已完成分片保存到 IndexedDB，刷新或短暂断网后通过服务端状态继续上传。

## 3. 数据结构

### 3.1 `users`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text primary key | Sites 稳定用户 ID |
| `email` | text not null | 展示与审计用途 |
| `created_at` / `updated_at` | integer not null | Unix 毫秒 |

### 3.2 `items`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text primary key | UUID |
| `owner_id` | text not null | 仅由服务端身份生成 |
| `type` | text not null | `file` 或 `folder` |
| `parent_id` | text nullable | 根目录为 null |
| `name` / `name_key` | text not null | 用户名与 NFC、小写的冲突键 |
| `object_key` | text nullable | 仅文件使用的随机 R2 键 |
| `mime_type` | text nullable | 浏览器 MIME 或 `application/octet-stream` |
| `size_bytes` | integer not null | 文件字节数；文件夹为 0 |
| `is_favorite` | integer not null | 0 或 1 |
| `created_at` / `updated_at` / `last_accessed_at` | integer not null | Unix 毫秒 |
| `deleted_at` / `original_parent_id` | integer/text nullable | 软删除与恢复信息 |

`items(owner_id, parent_id, name_key)` 在未删除时保持唯一；根目录用归一化父目录表达式保证唯一。文件夹删除和恢复处理完整子树，绝不覆盖现有项目。

### 3.3 `upload_sessions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text primary key | 客户端可见的随机会话 ID |
| `owner_id` | text not null | 当前 Sites 用户 |
| `parent_id` | text nullable | 完成后所属目录 |
| `name` / `name_key` | text not null | 已规范化的最终文件名 |
| `relative_path` | text nullable | 文件夹上传时的相对路径，仅用于进度和目录映射 |
| `object_key` | text not null | 只保存在服务端的随机 R2 键 |
| `r2_upload_id` | text not null | 只保存在服务端的 R2 multipart ID |
| `mime_type` | text not null | 文件 MIME |
| `size_bytes` | integer not null | 1 到 5 GiB |
| `part_size_bytes` | integer not null | 固定 8 MiB |
| `status` | text not null | `active`、`completing`、`completed`、`aborted` |
| `created_at` / `updated_at` / `expires_at` | integer not null | 生命周期时间戳 |

索引覆盖 `(owner_id, status, updated_at)` 与 `expires_at`。创建会话时校验父目录、名称和大小；完成前再次校验父目录和同名冲突。会话只能由所有者访问。过期 multipart 由 R2 生命周期清理，应用在后续访问时同步标记失效。

## 4. 服务端接口

所有接口拒绝未登录请求；请求中的 `ownerId` 一律拒绝。资源只能通过当前用户与资源 ID 联合查询。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/bootstrap` | 返回用户、上传限制、空间摘要、当前目录第一页、面包屑 |
| `GET /api/items` | 按视图、目录、搜索、排序和游标分页读取项目 |
| `POST /api/folders` | 新建文件夹 |
| `POST /api/folder-trees` | 批量创建或复用相对路径文件夹，返回路径到目录 ID 的映射 |
| `POST /api/uploads` | 创建 multipart 会话 |
| `PUT /api/uploads/:id/parts/:partNumber` | 流式上传一个分片并返回 partNumber、ETag |
| `GET /api/uploads/:id` | 返回会话和已上传分片，用于续传校准 |
| `POST /api/uploads/:id/complete` | 校验分片，完成 R2 对象并写入 `items` |
| `DELETE /api/uploads/:id` | 取消并中止 multipart 会话 |
| `PATCH /api/items/:id` | 单项重命名、移动或收藏 |
| `POST /api/items/batch` | 批量移动、收藏、回收、恢复或永久删除 |
| `POST /api/items/:id/trash` | 单项软删除；非空目录校验确认数量 |
| `POST /api/items/:id/restore` | 恢复单项或子树 |
| `DELETE /api/items/:id` | 永久删除回收站项目和 R2 对象 |
| `GET /api/items/:id/content?mode=download|preview` | 受鉴权的流式下载或预览 |
| `GET /api/folders/:id/count` | 返回目录直接与递归数量 |

`view` 支持 `files`、`recent`、`favorites`、`trash`、`search`。排序只从名称、类型、大小、更新时间的固定映射中选择 SQL 列。项目分页每页最多 100 条，返回不透明游标。

## 5. 上传、下载与预览规则

- `MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024`，即单文件 5 GiB；空文件与超限文件在前后端都拒绝。
- `UPLOAD_PART_BYTES = 8 * 1024 * 1024`。除最后一片外必须等长，分片号从 1 开始；完成接口拒绝缺片、重复片或错误顺序。
- 前端同时传输 3 个分片、同时处理最多 2 个文件。失败分片以有上限的指数退避重试 3 次。
- 上传中心展示总进度、当前速度、剩余时间、暂停、继续、重试和取消；完成后只刷新受影响目录和空间摘要。
- 入口提供“上传文件”和“上传文件夹”。文件夹选择使用 `webkitdirectory`，拖放通过 File System Entry API 递归读取；不支持目录 API 的浏览器回退到普通多文件上传。
- 文件夹上传保留 `webkitRelativePath`，先建立或复用目录，再把文件上传到对应目录。已有同名文件夹复用；同名文件绝不覆盖，单独列出失败项。
- 服务端不执行、不解压、不解析上传内容。
- 顺序为：创建会话并校验 → R2 分片写入 → 完成时重新校验 → R2 complete → D1 插入。D1 插入失败时删除完成对象并标记失败，避免无主对象。
- 下载使用流式 `Response`，不再调用 `object.arrayBuffer()`；保留安全的 `Content-Disposition`、`nosniff` 与 `private, no-store`。
- 图片、PDF 与白名单文本可以站内预览；文本最多读取 256 KiB，其他格式只显示详情和下载入口。

## 6. 文件名、目录与批量安全

- 名称去除首尾空白，长度为 1–180 个 Unicode 字符，拒绝控制字符、`/`、`\\`、`.`、`..`。
- 相对路径逐段使用相同名称校验，不接受绝对路径、空段或 `..`；D1/R2 不以用户输入拼接对象键。
- `parentId` 只能指向当前用户的未删除目录；移动目录时检查自身与后代循环。
- 批量接口限制一次最多 100 个唯一 ID。先读取并校验整个集合，再执行变更；任一项目越权、冲突或目标非法时整个批次不执行。
- 批量移动先验证目标目录与所有名称冲突；批量删除目录使用服务端汇总的精确后代数量确认。
- 日志只记录操作类型和不可逆的内部诊断，不记录文件内容、凭据、R2 上传 ID 或完整用户输入。

## 7. 界面与交互设计

视觉方向仍为“桌面文件匣”，但从偏旧式的米白仪表盘调整为清爽的专业工作台：近白中性工作区、深海军蓝文字、青绿色主操作、琥珀色文件夹和少量珊瑚危险色。保持克制、明快和高对比，不使用渐变文字、玻璃卡片、嵌套卡片或模板统计卡片。

新 Logo 使用图像模型生成透明背景的独立品牌图形：一张向上跃起的文件片进入打开的匣子，使用海军蓝、青绿与少量琥珀色；图形内部不得生成文字。应用中与“跃匣 LeapBox”文本字标组合，并输出适合侧栏、favicon 和社交预览的裁切版本。

- 桌面侧栏保留我的文件、最近使用、收藏、回收站和空间摘要；顶部显示面包屑、搜索、新建文件夹、分拆式上传菜单和视图切换。
- 移动端侧栏折叠为抽屉，搜索、面包屑、上传和批量操作均保持可用。
- 列表和网格都提供复选框；支持点击选择、`Shift` 连选、当前页全选和 `Escape` 清空。
- 存在选中项时显示固定批量工具栏，明确显示数量，并按当前视图提供移动、收藏、移入回收站、恢复或永久删除。
- 批量冲突对话框列出冲突项目，且不产生部分修改。
- 空状态、上传中心、错误、预览、移动和删除确认使用语义化状态区或对话框；键盘焦点清晰可见。

### 7.1 响应速度优化

- 搜索防抖 250 ms，并用 `AbortController` 取消旧请求，过期响应不得覆盖新结果。
- 首次 bootstrap 与目录列表分离：账户与空间数据缓存，移动目标目录只在打开对话框时加载。
- 项目列表按游标分页，每页 100 项，避免一次查询和渲染数百项。
- 新建、重命名、收藏、移动和删除先局部更新当前列表，再后台刷新空间摘要；失败时回滚并显示具体错误。
- 上传、批量操作和预览分别拥有独立忙碌状态，不再用全页 loading 阻塞已显示内容。
- 长列表只为当前新增或可见项目创建动效；避免为数百项同时创建 Tween。

### 7.2 GSAP 动效

- 使用 `gsap.timeline()` 编排首次进入：标题、工具区和可见文件项按 30 ms 间隔轻微淡入上移，总时长不超过 420 ms。
- 批量工具栏从底部用 `y` 与 `autoAlpha` 进入；选择变化只做轻微 `scale` 反馈。
- 对话框、上传中心和 Toast 使用可逆时间线；上传完成只做一次短促成功反馈，不使用弹跳、弹性或无限装饰动画。
- 文件移动或删除成功时以 `x`/`y`、`scale`、`autoAlpha` 退出后再移除；不动画 `width`、`height`、`top` 或 `left`。
- 时间线在组件卸载时 `kill()` 或由上下文回收。`prefers-reduced-motion: reduce` 下跳过位移，只保留即时状态变化或不超过 100 ms 的淡化。

## 8. 错误与一致性策略

- 唯一索引是重名并发写入的最终保护，约束错误转换为稳定的中文冲突提示。
- 完成 R2 对象而 D1 写入失败时补偿删除对象。
- 永久删除先收集当前用户子树的对象键，R2 删除成功或确认不存在后才删除 D1 记录。
- 上传完成接口通过会话状态防止重复完成；取消与完成竞争时只能有一个状态转换成功。
- 恢复、单项移动、批量移动与重命名在操作前完成所有校验，失败时不产生部分更新。
- 对象不存在、会话过期、分片非法、D1/R2 失败均返回稳定错误码和可操作的中文提示。

## 9. 验收标准

自动化测试覆盖：5 GiB 上限、8 MiB 分片、会话权限和状态机、缺片/重复片拒绝、完成补偿、文件夹路径映射、批量操作原子性、名称与同名规则、循环移动、软删除/恢复、下载响应头和预览规则。构建必须生成 Cloudflare Worker 兼容产物与 D1 迁移。

私有部署环境验证：

1. 未登录页面触发 ChatGPT 登录，未登录 API 返回 401。
2. 验证 5 GiB 边界契约；至少完成一个跨多分片的真实文件上传，并下载比对内容哈希。
3. 上传中断、刷新后可继续，只重传缺失分片；暂停、继续、重试和取消正确。
4. 选择或拖入多级文件夹后，目录结构与文件相对位置完整保留。
5. 列表和网格中可多选、Shift 连选、全选并统一移动、收藏、回收、恢复和永久删除；冲突批次不产生部分修改。
6. 快速连续搜索只有最新结果生效；目录切换和单项操作不使整个文件区重新 loading。
7. 新 Logo 在深浅背景、侧栏小尺寸和 favicon 尺寸下清晰，无错误文字或不透明底色。
8. GSAP 动效流畅且不阻塞操作；减少动态效果模式没有明显位移动画。
9. 搜索、排序、收藏、最近使用和原目录显示正确。
10. 删除进入回收站，恢复回原目录；永久删除后无法下载，R2 对象已清除。
11. 同目录同名创建、上传、重命名和移动均不覆盖。
12. 伪造资源 ID、`ownerId`、`parentId`、会话 ID 或 partNumber 不能越权读写。
13. 桌面与手机视口均可完成文件/文件夹上传、浏览、批量操作、下载和删除。
14. D1 保存权威元数据与上传会话，R2 保存二进制；刷新和重新登录后数据不丢失。

## 10. 明确不包含

本次升级不包含公开分享、多用户协作、在线编辑、文件版本历史、付费容量套餐、跨设备自动续传、解压、杀毒、离线缩略图或全文内容搜索。断点信息仅保存在当前浏览器 IndexedDB；空间概览显示已用空间和项目数量，并注明实际额度由 Sites 套餐决定。
