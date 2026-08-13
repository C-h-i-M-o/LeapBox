import { requireChatGPTUser } from "./chatgpt-auth";
import { FileManager } from "./components/FileManager";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <FileManager displayName={user.displayName} email={user.email} />;
}
