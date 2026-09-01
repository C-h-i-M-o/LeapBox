import assert from "node:assert/strict";
import test from "node:test";

import { resumeContent } from "../app/(public)/resume/resume-content.ts";
import {
  getResumeDocumentLanguage,
  normalizeResumeLocale,
} from "../app/(public)/resume/use-resume-locale.ts";

test("中英文作品集内容保持相同的信息结构", () => {
  assert.equal(resumeContent.zh.projects.length, 3);
  assert.equal(resumeContent.en.projects.length, 3);
  assert.equal(resumeContent.zh.strengths.length, 4);
  assert.equal(resumeContent.en.strengths.length, 4);
  assert.equal(resumeContent.zh.awards.items.length, 9);
  assert.equal(resumeContent.en.awards.items.length, 9);
  assert.deepEqual(
    resumeContent.zh.navigation.links.map((link) => link.href),
    resumeContent.en.navigation.links.map((link) => link.href),
  );
});

test("关于模块使用确认后的经历与技术轨道内容", () => {
  assert.equal(
    resumeContent.zh.about.introduction,
    "我是刘逸伦，一名 AI 开发者和软件工程本科生。我的工作横跨大模型应用、前端体验、后端服务与数据检索，更关注系统如何被验证、解释并持续交付。",
  );
  assert.equal(
    resumeContent.zh.about.timeline[0]?.summary,
    "专业绩点 3.670/5.0，排名 14/84（前 17%）。",
  );
  assert.equal(resumeContent.zh.about.timeline[0]?.organization, "东华大学 · 双一流 / 211");
  assert.equal(resumeContent.zh.about.timeline[1]?.organization, "上海艾杰飞人才管理咨询有限公司");
  assert.equal(resumeContent.en.about.timeline[0]?.organization, "Donghua University · Double First-Class / 211");
  assert.equal(resumeContent.en.about.timeline[1]?.organization, "RGF Talent Solutions China Co., Ltd.");
  assert.deepEqual(resumeContent.zh.about.techStack, [
    "LLM Evaluation",
    "RAG",
    "Agent",
    "Elasticsearch",
    "React",
    "TypeScript",
    "FastAPI",
    "MySQL",
  ]);
});

test("Hero 不包含重复行动按钮且脱敏项目标记为实习项目", () => {
  const serialized = JSON.stringify(resumeContent);
  assert.doesNotMatch(serialized, /查看精选项目|开始对话|Explore selected work|Start a conversation/u);
  assert.equal(resumeContent.zh.projectSection.privateProjectLabel, "实习项目");
  assert.equal(resumeContent.en.projectSection.privateProjectLabel, "Internship Project");
  assert.equal(resumeContent.zh.projects.filter((project) => !project.href).length, 2);
});

test("获奖圆环包含确认后的九项经历", () => {
  assert.deepEqual(
    resumeContent.zh.awards.items.map((award) => `${award.period}｜${award.title}${award.distinction ? `｜${award.distinction}` : ""}`),
    [
      "2024.12｜CACC 上海市二等奖",
      "2024.12｜东华大学程序设计新人邀请赛银奖",
      "2025.03｜入党积极分子培训班主题讨论第三名",
      "2025.05｜第十六届蓝桥杯上海赛区 C/C++ 程序设计大学 A 组二等奖",
      "2025.05｜东华大学数学竞赛二等奖",
      "2025.05｜金马五校程序设计竞赛铜奖",
      "2025.07｜中国大学生程序设计竞赛（CCPC）上海市赛铜奖｜队长",
      "2025.12｜东华大学一等奖学金",
      "2025.12｜东华大学优秀学生干部",
    ],
  );
});

test("页面移除未批准的数字、课程成绩和简历下载信息", () => {
  const serialized = JSON.stringify(resumeContent);
  assert.doesNotMatch(serialized, /目前就读于东华大学|Software Engineering at Donghua University/u);
  assert.doesNotMatch(serialized, /数据结构 98|数据库应用 92|Data Structures 98|Database Applications 92/u);
  assert.doesNotMatch(serialized, /10\.360|4\.896/u);
  assert.doesNotMatch(serialized, /下载简历|Download resume|resume download/u);
  assert.equal(resumeContent.zh.projects[0]?.outcome, undefined);
  assert.equal(resumeContent.en.projects[0]?.outcome, undefined);
});

test("个人优势与联系收尾使用确认后的文案", () => {
  assert.equal(resumeContent.zh.strengths[2]?.title, "检索与数据处理");
  assert.equal(
    resumeContent.zh.strengths[3]?.description,
    "熟悉 Git 协作、项目部署和前端工程化工具，关注功能验证、代码质量与可持续交付。",
  );
  assert.deepEqual(resumeContent.zh.contact.title, [
    "有值得验证的想法，",
    "我们可以从一次对话开始。",
  ]);
  assert.equal(
    resumeContent.zh.contact.statement,
    "如果你正在寻找 AI 应用、全栈开发或检索工程方向的合作伙伴，欢迎与我联系。",
  );
});

test("作品集只包含批准公开的邮箱与 GitHub", () => {
  const serialized = JSON.stringify(resumeContent);
  assert.match(serialized, /liuyilun0603@163\.com/u);
  assert.match(serialized, /https:\/\/github\.com\/C-h-i-M-o/u);
  assert.doesNotMatch(serialized, /15235577669/u);
});

test("英文内容来自英文简历中的身份与项目表达", () => {
  assert.equal(resumeContent.en.hero.role, "AI Developer");
  assert.match(resumeContent.en.about.introduction, /AI applications/u);
  assert.equal(resumeContent.en.projects[0]?.title, "EvalSpark");
  assert.match(resumeContent.en.projects[0]?.description ?? "", /evaluation lab/u);
});

test("未保存或无效的语言值统一回退为中文", () => {
  assert.equal(normalizeResumeLocale(null), "zh");
  assert.equal(normalizeResumeLocale("fr"), "zh");
  assert.equal(normalizeResumeLocale("en"), "en");
});

test("页面语言标记与当前作品集语言一致", () => {
  assert.equal(getResumeDocumentLanguage("zh"), "zh-CN");
  assert.equal(getResumeDocumentLanguage("en"), "en");
});
