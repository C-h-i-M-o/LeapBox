import type { Metadata } from "next";
import { FileManager } from "../../components/FileManager";
import { ProtectedRoute } from "../../components/ProtectedRoute";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "跃匣 LeapBox · 私人文件管理",
  description: "跃匣 LeapBox，安静、可靠的私人文件管理空间。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/leapbox-logo.png",
    shortcut: "/leapbox-logo.png",
    apple: "/leapbox-logo.png",
  },
  openGraph: {
    title: "跃匣 LeapBox · 私人文件管理",
    description: "支持 5 GB 大文件、文件夹上传与批量整理的私人文件工作台。",
    images: ["/leapbox-logo.png"],
  },
};

export default function LeapBoxPage() {
  return (
    <ProtectedRoute
      returnTo="/leapbox"
      render={(user) => (
        <FileManager displayName={user.displayName} email={user.email} />
      )}
    />
  );
}
