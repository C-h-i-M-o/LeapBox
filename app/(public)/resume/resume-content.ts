export type ResumeLocale = "zh" | "en";

export type NavigationLink = {
  href: "#about" | "#awards" | "#work" | "#strengths" | "#contact";
  label: string;
};

export type TimelineEntry = {
  period: string;
  organization: string;
  role: string;
  summary: string;
};

export type AwardContent = {
  period: string;
  title: string;
  distinction?: string;
};

export type ProjectContent = {
  number: string;
  title: string;
  category: string;
  description: string;
  outcome?: string;
  stack: readonly string[];
  image: string;
  imageAlt: string;
  href?: string;
};

export type StrengthContent = {
  number: string;
  title: string;
  description: string;
  skills: readonly string[];
};

export type ResumeContent = {
  navigation: {
    brand: string;
    links: readonly NavigationLink[];
    contactLabel: string;
    languageSwitchLabel: string;
  };
  hero: {
    eyebrow: string;
    role: string;
    title: readonly string[];
    statement: string;
    scrollLabel: string;
  };
  about: {
    sectionLabel: string;
    title: string;
    introduction: string;
    portraitAlt: string;
    location: string;
    emailLabel: string;
    githubLabel: string;
    timelineLabel: string;
    timeline: readonly TimelineEntry[];
    techStack: readonly string[];
  };
  awards: {
    sectionLabel: string;
    title: string;
    introduction: string;
    items: readonly AwardContent[];
  };
  projectSection: {
    sectionLabel: string;
    title: string;
    introduction: string;
    viewProjectLabel: string;
    privateProjectLabel: string;
  };
  projects: readonly ProjectContent[];
  strengthsSection: {
    sectionLabel: string;
    title: string;
    introduction: string;
  };
  strengths: readonly StrengthContent[];
  contact: {
    sectionLabel: string;
    title: readonly string[];
    statement: string;
    emailLabel: string;
    githubLabel: string;
    locationLabel: string;
    location: string;
    emailHref: string;
    githubHref: string;
    backToTopLabel: string;
    footer: string;
  };
};

const sharedLinks = {
  email: "mailto:liuyilun0603@163.com",
  github: "https://github.com/C-h-i-M-o",
} as const;

const techStack = [
  "LLM Evaluation",
  "RAG",
  "Agent",
  "Elasticsearch",
  "React",
  "TypeScript",
  "FastAPI",
  "MySQL",
] as const;

const zh: ResumeContent = {
  navigation: {
    brand: "刘逸伦 / 作品集",
    links: [
      { href: "#about", label: "经历" },
      { href: "#awards", label: "荣誉" },
      { href: "#work", label: "项目" },
      { href: "#strengths", label: "能力" },
      { href: "#contact", label: "联系" },
    ],
    contactLabel: "联系我",
    languageSwitchLabel: "切换为英文",
  },
  hero: {
    eyebrow: "上海 · AI 应用与全栈工程",
    role: "AI 开发者",
    title: ["把 AI 的不确定", "变成可以验证的产品"],
    statement:
      "我构建模型评测、RAG、Agent 与企业级 AI 工作流，也关心它们是否准确、快速，并真正进入生产环境。",
    scrollLabel: "向下探索",
  },
  about: {
    sectionLabel: "01 / 关于我",
    title: "在模型能力与真实业务之间，搭一座能落地的桥。",
    introduction:
      "我是刘逸伦，一名 AI 开发者和软件工程本科生。我的工作横跨大模型应用、前端体验、后端服务与数据检索，更关注系统如何被验证、解释并持续交付。",
    portraitAlt: "象征 AI 开发者身份的抽象线稿人物插画",
    location: "上海，中国",
    emailLabel: "邮箱",
    githubLabel: "GitHub",
    timelineLabel: "经历轨迹",
    timeline: [
      {
        period: "2024.09 — 2028.06",
        organization: "东华大学 · 双一流 / 211",
        role: "软件工程本科",
        summary: "专业绩点 3.670/5.0，排名 14/84（前 17%）。",
      },
      {
        period: "2026.07 — 至今",
        organization: "上海艾杰飞人才管理咨询有限公司",
        role: "全栈开发工程师（侧重前端）",
        summary:
          "参与企业级简历管理平台与浏览器插件研发，覆盖 AI 简历解析、Elasticsearch 检索与精准高亮等核心链路。",
      },
    ],
    techStack,
  },
  awards: {
    sectionLabel: "02 / 获奖经历",
    title: "让每一次竞赛与认可\n都成为继续构建的坐标",
    introduction: "从程序设计、数学竞赛到团队协作，这些经历记录了我持续解决问题的过程。",
    items: [
      { period: "2024.12", title: "CACC 上海市二等奖" },
      { period: "2024.12", title: "东华大学程序设计新人邀请赛银奖" },
      { period: "2025.05", title: "第十六届蓝桥杯上海赛区 C/C++ 程序设计大学 A 组二等奖" },
      { period: "2025.05", title: "东华大学数学竞赛二等奖" },
      { period: "2025.05", title: "金马五校程序设计竞赛铜奖" },
      {
        period: "2025.07",
        title: "中国大学生程序设计竞赛（CCPC）上海市赛铜奖",
        distinction: "队长",
      },
      { period: "2025.12", title: "东华大学一等奖学金" },
      { period: "2025.12", title: "东华大学优秀学生干部" },
    ],
  },
  projectSection: {
    sectionLabel: "03 / 精选项目",
    title: "不是展示功能清单\n而是问题如何被解决",
    introduction:
      "三个项目分别对应 AI 评测、企业检索链路与 Agent 工程化。企业项目内容已脱敏，仅保留可公开的技术方法与结果。",
    viewProjectLabel: "查看项目",
    privateProjectLabel: "实习项目",
  },
  projects: [
    {
      number: "P / 01",
      title: "EvalSpark",
      category: "AI 评测实验室",
      description:
        "为模型、RAG 与 Agent 应用建立统一评测依据，整合规则评分、三轮 LLM-as-a-Judge 与用户反馈，覆盖内容质量、格式、安全、忠实度和工具调用。",
      stack: ["React", "FastAPI", "MySQL", "RAG", "LLM Judge"],
      image: "/resume/project-evalspark.webp",
      imageAlt: "EvalSpark AI 评测实验室抽象项目封面",
      href: "https://github.com/C-h-i-M-o/EvalSpark",
    },
    {
      number: "P / 02",
      title: "Resume Intelligence",
      category: "企业级 AI 简历工程",
      description:
        "将非结构化 PDF 转换为符合业务 Schema 的结构化数据，并优化 Elasticsearch 检索链路，由后端统一返回命中区间，前端按区间高亮。",
      outcome: "打通简历解析、检索、高亮与入库的完整链路",
      stack: ["Next.js", "TypeScript", "Elasticsearch", "LLM", "Browser Extension"],
      image: "/resume/project-resume-intelligence.webp",
      imageAlt: "企业 AI 简历解析与检索链路抽象封面",
    },
    {
      number: "P / 03",
      title: "Git Development Reporter",
      category: "Agent 工程化 Skill",
      description:
        "将 Git log、diff 与验证结果转化为结构化开发汇报。Agent 根据提交 ID 自动整理需求、实现、影响范围及测试证据。",
      outcome: "从代码提交直接生成可复用的开发报告",
      stack: ["Git", "Agent", "Prompt Engineering", "Tool Calling"],
      image: "/resume/project-git-report.webp",
      imageAlt: "Git 变更分析与 Agent 汇报抽象封面",
    },
  ],
  strengthsSection: {
    sectionLabel: "04 / 个人优势",
    title: "让 AI 能力通过工程约束\n变成可靠的用户体验",
    introduction: "从模型、数据到界面与交付，四项能力共同组成完整的产品链路。",
  },
  strengths: [
    {
      number: "01",
      title: "AI 应用构建",
      description:
        "熟悉 Prompt Engineering、RAG、Agent、Embedding、Tool Calling 与 OpenAI-compatible API，具备多模型调度和 AI 应用评测实践。",
      skills: ["RAG", "Agent", "Tool Calling", "LLM-as-a-Judge"],
    },
    {
      number: "02",
      title: "全栈工程交付",
      description:
        "使用 React、TypeScript、Next.js、FastAPI 与 Node.js 完成产品开发、接口联调和功能落地。",
      skills: ["React", "TypeScript", "FastAPI", "Node.js"],
    },
    {
      number: "03",
      title: "检索与数据处理",
      description:
        "熟悉 MySQL、SQL 与 Elasticsearch，具备结构化数据处理、关键词检索和系统集成经验。",
      skills: ["MySQL", "SQL", "Elasticsearch", "Search"],
    },
    {
      number: "04",
      title: "工程化思维",
      description:
        "熟悉 Git 协作、项目部署和前端工程化工具，关注功能验证、代码质量与可持续交付。",
      skills: ["Git", "Testing", "Engineering", "Deployment"],
    },
  ],
  contact: {
    sectionLabel: "05 / 联系",
    title: ["有值得验证的想法", "我们从一次对话开始"],
    statement: "如果你正在寻找 AI 应用、全栈开发或检索工程方向的合作伙伴，欢迎与我联系。",
    emailLabel: "发送邮件",
    githubLabel: "访问 GitHub",
    locationLabel: "所在地",
    location: "上海",
    emailHref: sharedLinks.email,
    githubHref: sharedLinks.github,
    backToTopLabel: "回到顶部",
    footer: "刘逸伦 · AI 开发者 · 上海",
  },
};

const en: ResumeContent = {
  navigation: {
    brand: "Yilun Liu / Portfolio",
    links: [
      { href: "#about", label: "About" },
      { href: "#awards", label: "Awards" },
      { href: "#work", label: "Work" },
      { href: "#strengths", label: "Strengths" },
      { href: "#contact", label: "Contact" },
    ],
    contactLabel: "Contact",
    languageSwitchLabel: "切换为中文",
  },
  hero: {
    eyebrow: "Shanghai · AI Applications & Full-stack Engineering",
    role: "AI Developer",
    title: ["Turning AI uncertainty", "into verifiable products."],
    statement:
      "I build model evaluation, RAG, agent systems, and enterprise AI workflows—with equal attention to accuracy, latency, and real-world delivery.",
    scrollLabel: "Scroll to explore",
  },
  about: {
    sectionLabel: "01 / About",
    title: "Bridging model capability and the realities of production.",
    introduction:
      "I’m Yilun Liu, an AI developer and Software Engineering. My work spans AI applications, front-end experience, back-end services, and search infrastructure, with a focus on making systems verifiable, explainable, and continuously deliverable.",
    portraitAlt: "Abstract line portrait representing an AI developer",
    location: "Shanghai, China",
    emailLabel: "Email",
    githubLabel: "GitHub",
    timelineLabel: "Experience",
    timeline: [
      {
        period: "Sep 2024 — Jun 2028",
        organization: "Donghua University·Double Tops 211",
        role: "B.Eng. in Software Engineering",
        summary: "GPA 3.670/5.0, ranked 14/84 (top 17%).",
      },
      {
        period: "Jul 2026 — Present",
        organization: "RGF Talent Solutions China Co., Ltd.",
        role: "Full-Stack Developer — Front-End Focus",
        summary:
          "Contributed to an enterprise resume platform and browser extension across AI resume parsing, Elasticsearch search, and precise highlighting.",
      },
    ],
    techStack,
  },
  awards: {
    sectionLabel: "02 / Awards",
    title: "Every competition and recognition\nbecomes a coordinate for what comes next.",
    introduction: "From programming and mathematics to team leadership, these milestones record a sustained practice of solving problems.",
    items: [
      { period: "Dec 2024", title: "Second Prize, CACC Shanghai" },
      { period: "Dec 2024", title: "Silver Award, Donghua Newcomer Programming Invitational" },
      { period: "May 2025", title: "Second Prize, 16th Lanqiao Cup Shanghai, C/C++ University Group A" },
      { period: "May 2025", title: "Second Prize, Donghua University Mathematics Competition" },
      { period: "May 2025", title: "Bronze Award, Jinma Five-University Programming Contest" },
      {
        period: "Jul 2025",
        title: "Bronze Medal, CCPC Shanghai",
        distinction: "Team Captain",
      },
      { period: "Dec 2025", title: "First-Class Scholarship, Donghua University" },
      { period: "Dec 2025", title: "Outstanding Student Leader, Donghua University" },
    ],
  },
  projectSection: {
    sectionLabel: "03 / Selected work",
    title: "Not a feature list.\nA record of problems solved.",
    introduction:
      "Three projects across AI evaluation, enterprise search, and agentic engineering. Enterprise work is sanitized to retain only public technical methods and outcomes.",
    viewProjectLabel: "View project",
    privateProjectLabel: "Internship Project",
  },
  projects: [
    {
      number: "P / 01",
      title: "EvalSpark",
      category: "AI Evaluation Laboratory",
      description:
        "Built an evaluation lab for models, RAG systems, and agent applications, combining rule-based scoring, three rounds of LLM-as-a-Judge evaluation, and user feedback across quality, format, safety, faithfulness, and tool use.",
      stack: ["React", "FastAPI", "MySQL", "RAG", "LLM Judge"],
      image: "/resume/project-evalspark.webp",
      imageAlt: "Abstract cover for the EvalSpark AI evaluation laboratory",
      href: "https://github.com/C-h-i-M-o/EvalSpark",
    },
    {
      number: "P / 02",
      title: "Resume Intelligence",
      category: "Enterprise AI Resume Engineering",
      description:
        "Transformed unstructured PDFs into schema-compliant data and improved an Elasticsearch search pipeline. The backend returns matched ranges and the frontend renders precise highlights.",
      outcome: "A complete loop across parsing, search, highlighting, and ingestion",
      stack: ["Next.js", "TypeScript", "Elasticsearch", "LLM", "Browser Extension"],
      image: "/resume/project-resume-intelligence.webp",
      imageAlt: "Abstract cover for enterprise AI resume parsing and search",
    },
    {
      number: "P / 03",
      title: "Git Development Reporter",
      category: "Agentic Engineering Skill",
      description:
        "Turns Git logs, diffs, and validation results into structured development reports. Given a commit ID, an agent organizes requirements, implementation, impact scope, and test evidence.",
      outcome: "Reusable development reports generated directly from commit evidence",
      stack: ["Git", "Agent", "Prompt Engineering", "Tool Calling"],
      image: "/resume/project-git-report.webp",
      imageAlt: "Abstract cover for Git analysis and agentic reporting",
    },
  ],
  strengthsSection: {
    sectionLabel: "04 / Strengths",
    title: "Engineering constraints turn\nAI capability into reliable UX.",
    introduction: "From models and data to interfaces and delivery, four strengths shape a complete product pipeline.",
  },
  strengths: [
    {
      number: "01",
      title: "AI Application Development",
      description:
        "Experienced with prompt engineering, RAG, agents, embeddings, tool calling, OpenAI-compatible APIs, multi-model orchestration, and AI evaluation.",
      skills: ["RAG", "Agent", "Tool Calling", "LLM-as-a-Judge"],
    },
    {
      number: "02",
      title: "Full-Stack Delivery",
      description:
        "Building products, integrating APIs with React, TypeScript, Next.js, FastAPI, and Node.js.",
      skills: ["React", "TypeScript", "FastAPI", "Node.js"],
    },
    {
      number: "03",
      title: "Search & Data Processing",
      description:
        "Experienced with MySQL, SQL, and Elasticsearch across structured data processing, keyword search, and system integration.",
      skills: ["MySQL", "SQL", "Elasticsearch", "Search"],
    },
    {
      number: "04",
      title: "Engineering Discipline",
      description:
        "Experienced with Git collaboration, deployment, and front-end tooling, with a focus on verification, code quality, and sustainable delivery.",
      skills: ["Git", "Testing", "Engineering", "Deployment"],
    },
  ],
  contact: {
    sectionLabel: "05 / Contact",
    title: ["Have an idea worth validating?", "starting a conversation."],
    statement:
      "If you are looking for a collaborator in AI applications, full-stack development, or search engineering, I would be glad to connect.",
    emailLabel: "Send an email",
    githubLabel: "Visit GitHub",
    locationLabel: "Based in",
    location: "Shanghai",
    emailHref: sharedLinks.email,
    githubHref: sharedLinks.github,
    backToTopLabel: "Back to top",
    footer: "Yilun Liu · AI Developer · Shanghai",
  },
};

export const resumeContent: Record<ResumeLocale, ResumeContent> = { zh, en };

export const resumeLinks = sharedLinks;
