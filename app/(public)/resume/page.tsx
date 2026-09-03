import type { Metadata } from "next";

import { ResumePortfolio } from "./resume-portfolio";
import "./resume.css";
import "./resume-loading.css";

export const metadata: Metadata = {
  title: "刘逸伦 · AI 开发者",
  description: "刘逸伦的 AI 开发者作品集：模型评测、RAG、Agent、全栈工程与企业级 AI 工作流。",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/resume/favicon-32-v1.png", type: "image/png", sizes: "32x32" },
      { url: "/resume/favicon-64-v1.png", type: "image/png", sizes: "64x64" },
    ],
    shortcut: "/resume/favicon-32-v1.png",
  },
};

export default function ResumePage() {
  return (
    <>
      <link rel="preload" as="image" href="/resume/hero-poster.jpg" fetchPriority="high" />
      <ResumePortfolio />
    </>
  );
}
