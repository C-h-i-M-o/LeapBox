import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "个人展示页 · liuyilun.com.cn",
  description: "个人展示页面建设中。",
  robots: { index: true, follow: true },
};

export default function ResumePage() {
  return (
    <main className="public-placeholder">
      <p>个人展示页建设中</p>
    </main>
  );
}
