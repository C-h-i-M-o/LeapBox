# 跃匣 LeapBox 私人文件管理应用设计说明

## 1. 目标与边界

“跃匣 LeapBox”是一个仅供站点所有者本人使用的私人文件管理 Web 应用。第一版必须提供真实的文件上传、持久化保存、浏览、搜索、整理、预览、下载、收藏与回收站能力，不使用模拟数据替代平台存储。

站点通过 Sites 的 ChatGPT 身份验证与访问策略保护，访问级别保持为“仅所有者和工作区管理员”。应用不实现自有账号体系，也不包含公开分享、多人协作、在线编辑、文件版本历史或付费能力。

## 2. 技术架构

- 前端：Vinext、React 19、TypeScript，使用服务端渲染的受保护入口和客户端文件管理器。
- 身份：使用 Sites 转发的 ChatGPT 身份；页面通过 `requireChatGPTUser("/")` 发起登录，API 通过 `getChatGPTUser()` 返回 401，所有资源操作都使用服务端读取的 `userId`。
- 元数据：Cloudflare D1，逻辑绑定名为 `DB`，Drizzle 仅用于 schema 与迁移，业务查询使用 D1 prepared statements。
- 文件内容：Cloudflare R2，逻辑绑定名为 `FILES`。对象键格式为 `objects/<uuid>`，不含原始文件名，且不出现在客户端 JSON、页面或下载地址中。
- 本地浏览器存储：只允许保存列表/网格视图偏好；文件、文件夹、收藏、删除状态等权威数据全部来自 D1/R2。

服务端按职责分为：身份校验、输入校验、文件记录查询、目录关系校验、R2 读写、HTTP 路由。所有 API 先完成身份与所有权校验，再触碰元数据或对象。

## 3. 数据结构

### 3.1 `users`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text primary key | Sites 稳定用户 ID |
| `email` | text not null | 展示与审计用途 |
| `created_at` | integer not null | Unix 毫秒 |
| `updated_at` | integer not null | Unix 毫秒 |

索引：`users(updated_at)`。

### 3.2 `items`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text primary key | UUID |
| `owner_id` | text not null | 仅由服务端身份生成 |
| `type` | text not null | `file` 或 `folder` |
| `parent_id` | text nullable | 根目录为 null |
| `name` | text not null | 用户可见名称 |
| `name_key` | text not null | `trim().normalize("NFC").toLocaleLowerCase()`，用于同目录重名判断 |
| `object_key` | text nullable | 仅文件使用，随机 R2 键 |
| `mime_type` | text nullable | 上传请求中浏览器提供的 MIME，未知时为 `application/octet-stream` |
| `size_bytes` | integer not null | 文件字节数；文件夹为 0 |
| `is_favorite` | integer not null | 0 或 1 |
| `created_at` | integer not null | Unix 毫秒 |
| `updated_at` | integer not null | Unix 毫秒 |
| `last_accessed_at` | integer not null | 上传、创建、打开目录、预览或下载时更新 |
| `deleted_at` | integer nullable | 回收站时间；未删除为 null |
| `original_parent_id` | text nullable | 软删除前父目录，用于恢复 |

约束与索引：

- `type`、`is_favorite`、文件/文件夹所需字段使用 `CHECK` 约束。
- `items(owner_id)`、`items(parent_id)`、`items(owner_id, deleted_at, updated_at)`、`items(owner_id, last_accessed_at)` 建立普通索引。
- `items(owner_id, parent_id, name_key)` 在 `deleted_at IS NULL` 时建立唯一索引，阻止同目录重名覆盖。
- 根目录同名通过以空字符串归一化父目录的表达式唯一索引保证；应用层仍会在写入前检查并返回中文冲突提示。

删除文件夹时对其后代逐项写入相同 `deleted_at`，每项保留自己的 `original_parent_id`。恢复文件夹时恢复完整子树；若原父目录不存在、已删除或产生重名，则根节点回到根目录或要求先解决重名，绝不覆盖现有项目。

## 4. 服务端接口

所有接口都拒绝未登录请求；请求体中的 `ownerId` 一律忽略或拒绝，资源选择只能通过当前用户与资源 ID 联合查询。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/bootstrap` | 返回当前用户、上传限制、存储概览、当前目录项目、面包屑；支持 `parentId`、`view`、`query`、`sort`、`direction` |
| `POST /api/folders` | 新建文件夹，校验父目录归属、类型、未删除和同名冲突 |
| `POST /api/upload` | 接收单个 multipart 文件及 `parentId`；前端多文件逐个并发上传以展示独立进度 |
| `PATCH /api/items/:id` | 执行 `rename`、`move` 或 `favorite`，移动目录时禁止移动到自身或后代 |
| `POST /api/items/:id/trash` | 软删除文件或递归软删除文件夹；非空文件夹必须携带服务端返回的确认计数 |
| `POST /api/items/:id/restore` | 恢复项目或子树，执行父目录与重名校验 |
| `DELETE /api/items/:id` | 仅允许回收站项目；递归删除 R2 对象后删除 D1 元数据 |
| `GET /api/items/:id/content?mode=download|preview` | 核对身份、记录、删除状态与对象存在性后返回内容 |
| `GET /api/folders/:id/count` | 返回受保护文件夹的直接与递归项目数量，用于删除确认 |

`GET /api/bootstrap` 的 `view` 支持：

- `files`：指定目录的未删除直接子项。
- `recent`：按 `last_accessed_at` 倒序的未删除项目。
- `favorites`：未删除且收藏的项目。
- `trash`：回收站根项目，即已删除且父项未同时处于回收站的项目。
- `search`：当前用户全部未删除项目按名称子串搜索，并返回完整原目录面包屑。

排序支持名称、类型、大小和更新时间；服务端仅从固定字段映射中选择 SQL 排序列，绝不拼接客户端原始 SQL。

## 5. 上传、下载与预览规则

- `MAX_UPLOAD_BYTES` 集中定义为 `25 * 1024 * 1024`，空文件与超限文件在前端和服务端都拒绝。
- 第一版使用单文件 multipart 请求；批量选择后由前端建立逐文件上传任务，每个任务显示进度、成功或失败。
- 服务端不根据扩展名判断安全性，不执行、不解压、不解析上传内容。
- 上传顺序为：校验身份与父目录 → 生成随机 ID/对象键 → R2 写入 → D1 插入。D1 插入失败时立即删除刚写入的 R2 对象。
- 下载响应使用 `Content-Disposition: attachment`，同时提供安全的 ASCII `filename` 与 RFC 5987 `filename*`；设置 `X-Content-Type-Options: nosniff`、`Cache-Control: private, no-store`。
- 图片仅允许 `image/*` 站内预览，PDF 仅允许 `application/pdf` 站内预览。
- 纯文本预览仅允许白名单 MIME（`text/*`、JSON、XML、CSV、Markdown），最多读取 256 KiB；超出时显示详情和下载入口，不读取完整文件。
- 其他文件只返回元数据详情与下载入口。任何预览 URL 都是受鉴权的站内 API，不含 R2 键。

## 6. 文件名与目录安全

- 名称去除首尾空白，长度为 1–180 个 Unicode 字符。
- 拒绝控制字符、`/`、`\\`、`.`、`..`，避免路径穿越和含义不明确的名称。
- D1/R2 不以用户输入拼接本地路径或对象键。
- `parentId` 只能指向当前用户的未删除文件夹；移动时额外检查循环关系。
- 对象不存在、重复删除、D1 失败和 R2 失败返回稳定的中文错误代码与消息；日志只记录操作类型和不可逆的内部诊断，不记录文件内容、凭据或完整用户输入。

## 7. 界面设计

视觉方向为“桌面文件匣”：米白工作区、深海军蓝文字、青绿色关键操作、少量珊瑚危险色。界面克制、明快，不使用营销首屏、模板统计卡片、大面积渐变或装饰动画。

- 桌面：左侧导航包含我的文件、最近使用、收藏、回收站和已使用空间；顶部显示面包屑、搜索、新建文件夹、上传与视图切换；右侧为文件列表或网格。
- 移动：侧栏折叠为抽屉，上传、搜索、面包屑和操作菜单保持可用。
- 列表展示图标、名称、原目录（搜索结果）、大小、类型、更新时间与收藏状态。
- 空状态、加载状态、上传队列、错误提示、文件详情/预览、重命名、移动和删除确认均使用语义化对话框或状态区。
- 所有按钮可通过键盘操作，使用可见焦点，拖放区也提供文件选择按钮，危险按钮使用明确中文文案。
- 视图偏好可以使用 `localStorage`；目录地址使用 `?folder=<id>`，刷新后保持有效目录，无效目录回根目录并显示提示。

## 8. 错误与一致性策略

- 唯一索引是重名并发写入的最终保护；接口将约束错误转换为“同一目录已存在同名项目”。
- R2 写入成功而 D1 失败时补偿删除对象。
- 永久删除先收集受当前用户保护的子树文件对象键，逐项删除 R2；仅在对象删除成功或明确不存在后删除 D1 子树记录。
- 恢复、移动和重命名均在操作前校验目标目录，失败时不产生部分更新。
- 删除非空文件夹需要用户输入/点击包含精确项目数量的确认，服务端重新计算并核对数量，防止陈旧确认。

## 9. 验收标准

自动化验证覆盖：名称校验、上传大小、下载响应头、排序白名单、权限查询条件、同名规则、循环移动、软删除/恢复策略和预览类型规则。构建必须生成 Cloudflare Worker 兼容产物与 D1 迁移。

私有预览环境需手动验证：

1. 未登录页面触发 ChatGPT 登录，未登录 API 返回 401。
2. 上传后刷新仍可见，并能以原名称下载相同内容。
3. 可创建多级目录并上传到指定目录。
4. 搜索、四种排序、收藏、最近使用和原目录显示正确。
5. 删除进入回收站，恢复回原目录；永久删除后无法下载且对应 R2 对象清除。
6. 同目录同名创建、上传、重命名和移动均不覆盖。
7. 伪造资源 ID、`ownerId` 或 `parentId` 不能越权读写。
8. 桌面与手机视口均可完成上传、浏览、下载和删除。
9. D1 保存权威元数据，R2 保存二进制；刷新和重新登录后数据不丢失。

## 10. 明确不包含

第一版不包含公开分享链接、多人协作、在线编辑、文件版本历史、付费或容量套餐展示、断点续传、文件解压、杀毒扫描、缩略图离线生成与全文内容搜索。存储概览只显示已用空间和项目数量，并说明实际额度由当前 Sites 套餐决定。
