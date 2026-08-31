import type { ReactNode } from "react";
import {
  requireChatGPTUser,
  type ChatGPTUser,
} from "../chatgpt-auth";

type ProtectedRouteProps = {
  returnTo: string;
  render: (user: ChatGPTUser) => ReactNode;
};

/** 统一在服务端完成 OpenAI 登录校验，并向受保护页面提供用户信息。 */
export async function ProtectedRoute({
  returnTo,
  render,
}: ProtectedRouteProps) {
  const user = await requireChatGPTUser(returnTo);
  return render(user);
}
