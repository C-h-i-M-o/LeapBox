# liuyilun.com.cn 路由拆分与 OpenAI 登录保护开发规格及计划

## 1. 背景

当前 Sites 项目已绑定 `liuyilun.com.cn`，站点访问级别为公开。现有根路由 `/` 直接执行 OpenAI 登录校验并呈现跃匣 LeapBox，导致整个域名入口等同于私人文件管理页面。

本次调整将同一站点拆分为公开与受保护两类页面路由：个人展示占位页公开访问，LeapBox 保持登录保护，根路由暂时留空。Sites 平台继续负责 OpenAI 登录流程，应用不实现自有 OAuth。

## 2. 目标

1. 将现有 LeapBox 从 `/` 移至 `/leapbox`，功能、数据和登录后用户体验保持不变。
2. 新建公开的 `/resume` 占位页，仅显示“个人展示页建设中”。
3. 根路由 `/` 返回空白页面和 `200` 状态，不设置重定向。
4. 使用 `(public)` 与 `(protected)` 路由分组表达页面访问边界，但不改变最终 URL。
5. 将 OpenAI 登录校验复用为通用服务端 `ProtectedRoute` 组件，受保护页面显式提供安全的站内回跳地址。
6. 保持全部文件 API 的服务端身份校验，匿名请求继续返回 `401`。

## 3. 非目标

- 不开发正式个人简历、个人介绍、项目经历或联系方式展示。
- 不新增导航页、登录页、注册页或根路径跳转。
- 不实现自有 OAuth、会话、Cookie 或令牌存储。
- 不修改 D1 表结构、R2 对象、数据库数据或现有文件数据。
- 不改变 LeapBox 的上传、整理、预览、下载、回收站或批处理能力。
- 不安装新依赖，不进行无关重构，不使用 sub agent。

## 4. 路由与访问矩阵

| URL | 路由分组 | 匿名访问 | 已登录访问 | 索引策略 |
| --- | --- | --- | --- | --- |
| `/` | 根路由 | `200`，空白 | `200`，空白 | 中性站点元数据 |
| `/resume` | `(public)` | `200`，显示占位文案 | 同匿名访问 | 允许索引 |
| `/leapbox` | `(protected)` | 跳转 OpenAI 登录 | 呈现完整 LeapBox | `noindex`、`nofollow` |
| `/api/...` | API | `401` JSON 错误 | 按现有逻辑处理 | 不适用 |

`/signin-with-chatgpt`、`/signout-with-chatgpt` 与 `/callback` 继续由 Sites 平台接管，应用不得创建同名路由。

## 5. 组件与接口设计

### 5.1 通用登录组件

新增服务端组件 `ProtectedRoute`，职责仅限于：

1. 接收同源相对路径 `returnTo`。
2. 调用现有 `requireChatGPTUser(returnTo)`。
3. 匿名访问时交由该辅助函数跳转 Sites 的 OpenAI 登录入口。
4. 登录成功时将完整、强类型的 `ChatGPTUser` 传给页面渲染函数。

组件接口固定为：

```ts
type ProtectedRouteProps = {
  returnTo: string;
  render: (user: ChatGPTUser) => ReactNode;
};
```

该组件必须保持为服务端组件，不得向浏览器传递身份请求头、令牌或登录内部信息。登录辅助逻辑继续位于 `.ts` 模块中；`.tsx` 文件仅保留组件渲染和导入。

### 5.2 页面组织

- `app/page.tsx`：返回空内容，不执行登录校验。
- `app/(public)/resume/page.tsx`：输出中性占位页面，不读取身份。
- `app/(protected)/leapbox/page.tsx`：通过 `ProtectedRoute` 获取用户并渲染现有 `FileManager`。
- LeapBox 页面使用固定回跳地址 `/leapbox`，避免登录后返回旧根路径。

### 5.3 API 保护

API 路由继续复用 `withApiContext`。它必须在创建文件服务和读写用户数据之前调用 `getChatGPTUser()`；身份缺失时立即返回：

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "请先使用 ChatGPT 登录"
  }
}
```

状态码保持 `401`。浏览器页面使用跳转，API 使用 JSON 错误，两类失败行为不得混用。

## 6. 元数据设计

1. 根布局改用中性的站点标题与描述，不继续把整个域名声明为 LeapBox。
2. `/resume` 使用独立标题，允许搜索引擎索引；本轮不添加个人隐私内容。
3. `/leapbox` 保留当前 LeapBox 标题、描述、图标和社交信息，并设置 `noindex`、`nofollow`。
4. 本次仅调整信息归属，不生成或替换社交预览图片。

## 7. 错误处理与安全约束

- `returnTo` 继续通过现有同源相对路径校验，拒绝外部 URL、协议相对 URL 和登录保留路径。
- 不能依赖客户端隐藏、按钮状态或路由命名实现权限控制；页面和 API 均在服务端校验。
- `(public)` 与 `(protected)` 仅表达代码组织和审查边界，真正的保护由 `ProtectedRoute` 与 `withApiContext` 执行。
- `/resume` 不读取 OpenAI 用户请求头，也不触发登录流程。
- 本次不执行任何数据库写入、迁移或清理操作。

## 8. 实施计划

1. **先补路由行为测试**
   - 将渲染测试辅助函数扩展为可指定路径与登录状态。
   - 覆盖根页空白、公开占位页、LeapBox 登录跳转、登录后 LeapBox 和匿名 API。
   - 验证：新增测试在实现前能准确暴露旧路由行为。
2. **封装通用服务端登录组件**
   - 复用现有 `ChatGPTUser` 与 `requireChatGPTUser`，不复制请求头解析逻辑。
   - 为 props 与渲染函数提供完整类型，不新增 `any`。
   - 验证：组件测试或生产构建确认服务端渲染与回跳地址有效。
3. **拆分页面路由与元数据**
   - 将现有 LeapBox 页面迁至 `/leapbox`。
   - 新增 `/resume` 占位页并将 `/` 改为空页面。
   - 将 LeapBox 专属元数据移至对应路由范围。
   - 验证：路由矩阵测试全部通过，根页无重定向。
4. **回归验证**
   - 运行单元测试、迁移契约测试、API 契约测试、生产构建和渲染测试。
   - 单独运行 lint，确认没有新增类型或规范错误。
   - 检查 Git 差异，确保无数据库迁移、依赖或无关文件改动。
5. **预览与发布**
   - 启动现有开发流程并打开首个可用预览。
   - 在公开发布前再次取得老大确认。
   - 发布同一 Sites 项目的新版本，保留现有自定义域名与公开访问级别。
   - 验证线上 `/`、`/resume`、`/leapbox` 以及匿名 API 行为。

## 9. 验收标准

1. 匿名访问 `/` 返回 `200`，不重定向，页面不显示 LeapBox 或 resume 占位文案。
2. 匿名访问 `/resume` 返回 `200`，仅显示“个人展示页建设中”，不包含姓名、联系方式或履历信息。
3. 匿名访问 `/leapbox` 进入 `/signin-with-chatgpt`，其 `return_to` 指向 `/leapbox`。
4. 已登录访问 `/leapbox` 返回 `200`，现有文件管理主界面与登录用户信息正常显示。
5. 匿名调用文件 API 返回 `401` 和既有 `UNAUTHENTICATED` 错误结构。
6. `/resume` 可索引，`/leapbox` 保持 `noindex`、`nofollow`。
7. 测试、生产构建和 lint 通过，Git 差异仅包含本需求直接相关文件。
8. 线上 `liuyilun.com.cn` 的三个页面路径符合本节要求，现有 D1、R2 与文件数据未被修改。

## 10. 实施门槛

本文件经老大复核批准后，才允许开始代码修改。代码完成并通过本地验证后，公开部署仍需单独确认。
