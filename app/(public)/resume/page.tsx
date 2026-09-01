import type { Metadata } from "next";

import { ResumePortfolio } from "./resume-portfolio";
import "./resume.css";

export const metadata: Metadata = {
  title: "刘逸伦 · AI 开发者",
  description: "刘逸伦的 AI 开发者作品集：模型评测、RAG、Agent、全栈工程与企业级 AI 工作流。",
  robots: { index: true, follow: true },
};

export default function ResumePage() {
  return <ResumePortfolio />;
}
