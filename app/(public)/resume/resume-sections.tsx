import type { ResumeContent, ResumeLocale } from "./resume-content.ts";
import {
  ArrowDownIcon,
  ArrowUpRightIcon,
  GithubIcon,
  MailIcon,
  SignalIcon,
} from "./resume-icons";

type SharedSectionProps = {
  content: ResumeContent;
};

type NavigationProps = SharedSectionProps & {
  locale: ResumeLocale;
  toggleLocale: () => void;
};

export function ResumeNavigation({ content, locale, toggleLocale }: NavigationProps) {
  return (
    <header className="resume-nav" data-hero-reveal>
      <a className="resume-brand" href="#top" aria-label={content.navigation.brand}>
        <span className="resume-brand-mark">YL</span>
        <span>{content.navigation.brand}</span>
      </a>
      <nav className="resume-nav-links" aria-label={locale === "zh" ? "作品集导航" : "Portfolio navigation"}>
        {content.navigation.links.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
      </nav>
      <div className="resume-nav-actions">
        <button
          className="resume-language-button"
          type="button"
          onClick={toggleLocale}
          aria-label={content.navigation.languageSwitchLabel}
          aria-pressed={locale === "en"}
        >
          <span className={locale === "zh" ? "is-active" : undefined}>中</span>
          <i aria-hidden="true" />
          <span className={locale === "en" ? "is-active" : undefined}>EN</span>
        </button>
        <a className="resume-contact-button" href="#contact">
          {content.navigation.contactLabel}
          <ArrowDownIcon />
        </a>
      </div>
    </header>
  );
}

export function HeroSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-hero" id="top" aria-labelledby="resume-hero-title" data-hero-stage>
      <div className="resume-hero-media" aria-hidden="true" data-hero-media>
        <video autoPlay muted loop playsInline poster="/resume/hero-poster.jpg">
          <source src="/resume/hero-data-flow.mp4" type="video/mp4" />
        </video>
        <div className="resume-hero-shade" />
        <div className="resume-grain" />
      </div>
      <div className="resume-hero-signal" aria-hidden="true" data-hero-signal><SignalIcon /></div>
      <div className="resume-hero-content resume-shell">
        <div className="resume-hero-kicker" data-hero-reveal>
          <span>{content.hero.role}</span>
          <span>{content.hero.eyebrow}</span>
        </div>
        <h1 id="resume-hero-title" data-hero-title>
          {content.hero.title.map((line) => <span key={line} data-hero-line>{line}</span>)}
        </h1>
        <div className="resume-hero-bottom" data-hero-reveal>
          <p>{content.hero.statement}</p>
        </div>
        <div className="resume-hero-meta" data-hero-reveal>
          <a href="#about"><ArrowDownIcon />{content.hero.scrollLabel}</a>
        </div>
      </div>
    </section>
  );
}

function TechTrack({ content, reverse }: SharedSectionProps & { reverse?: boolean }) {
  return (
    <div className={`resume-tech-row${reverse ? " is-reverse" : ""}`} data-tech-track>
      {[0, 1].map((copyIndex) => (
        <div className="resume-tech-track" key={copyIndex} aria-hidden={copyIndex === 1}>
          {content.about.techStack.map((technology) => (
            <span key={`${copyIndex}-${technology}`}>
              {technology}<i aria-hidden="true" />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AboutSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-about" id="about" aria-labelledby="resume-about-title">
      <div className="resume-about-stage" data-about-stage>
        <div className="resume-about-main resume-shell">
          <h2 className="resume-visually-hidden" id="resume-about-title">{content.about.title}</h2>
          <div className="resume-about-layout">
            <figure className="resume-portrait" data-about-portrait>
              <img src="/resume/portrait-line.webp" alt={content.about.portraitAlt} />
              <div className="resume-portrait-scan" data-about-scan aria-hidden="true" />
              <figcaption><SignalIcon />{content.about.location}</figcaption>
            </figure>

            <div className="resume-about-panels">
              <article className="resume-about-panel is-introduction" data-about-panel>
                <p className="resume-panel-kicker">{content.about.sectionLabel}</p>
                <p className="resume-about-introduction">{content.about.introduction}</p>
                <div className="resume-contact-lines">
                  <a href={content.contact.emailHref}>
                    <span>{content.about.emailLabel}</span>
                    <strong>liuyilun0603@163.com</strong>
                    <MailIcon />
                  </a>
                  <a href={content.contact.githubHref} target="_blank" rel="noreferrer">
                    <span>{content.about.githubLabel}</span>
                    <strong>github.com/C-h-i-M-o</strong>
                    <GithubIcon />
                  </a>
                </div>
              </article>

              {content.about.timeline.map((entry, index) => (
                <article className="resume-about-panel resume-experience-panel" key={`${entry.period}-${entry.organization}`} data-about-panel>
                  <p className="resume-panel-kicker">0{index + 2} / {content.about.timelineLabel}</p>
                  <time>{entry.period}</time>
                  <h3>{entry.organization}</h3>
                  <p className="resume-timeline-role">{entry.role}</p>
                  <p>{entry.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="resume-tech-marquee" aria-label={content.about.techStack.join(", ")}>
          <TechTrack content={content} />
          <TechTrack content={content} reverse />
        </div>
      </div>
    </section>
  );
}

export function AwardsSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-awards" id="awards" aria-labelledby="resume-awards-title">
      <div className="resume-awards-stage resume-shell" data-awards-stage>
        <div className="resume-awards-heading">
          <p className="resume-section-label">{content.awards.sectionLabel}</p>
          <h2 id="resume-awards-title">
            {content.awards.title.split("\n").map((line) => <span key={line}>{line}</span>)}
          </h2>
          <p>{content.awards.introduction}</p>
        </div>

        <div className="resume-awards-viewport" data-awards-viewport>
          <div className="resume-awards-axis" aria-hidden="true"><SignalIcon /></div>
          <div className="resume-awards-ring" data-awards-ring>
            {content.awards.items.map((award) => (
              <button
                className="resume-award-item"
                key={`${award.period}-${award.title}`}
                type="button"
                aria-label={`${award.period} · ${award.title}${award.distinction ? ` · ${award.distinction}` : ""}`}
                data-award-item
              >
                <span className="resume-award-period">{award.period}</span>
                <span className="resume-award-title">{award.title}</span>
                {award.distinction ? <span className="resume-award-distinction">{award.distinction}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProjectsSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-projects" id="work" aria-labelledby="resume-work-title">
      <div className="resume-shell">
        <div className="resume-section-heading">
          <p className="resume-section-label">{content.projectSection.sectionLabel}</p>
          <h2 id="resume-work-title">
            {content.projectSection.title.split("\n").map((line) => <span key={line}>{line}</span>)}
          </h2>
          <p>{content.projectSection.introduction}</p>
        </div>

        <div className="resume-project-stack">
          {content.projects.map((project) => (
            <article className="resume-project-card" key={project.number} data-project-card>
              <div className="resume-project-image" data-project-image>
                <img src={project.image} alt={project.imageAlt} />
                <span>{project.number}</span>
              </div>
              <div className="resume-project-copy" data-project-copy>
                <div className="resume-project-title-row">
                  <div>
                    <p>{project.category}</p>
                    <h3>{project.title}</h3>
                  </div>
                  {project.href ? (
                    <a
                      href={project.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${content.projectSection.viewProjectLabel}: ${project.title}`}
                    >
                      <ArrowUpRightIcon />
                    </a>
                  ) : <span className="resume-private-badge">{content.projectSection.privateProjectLabel}</span>}
                </div>
                <p className="resume-project-description">{project.description}</p>
                {project.outcome ? <p className="resume-project-outcome"><SignalIcon />{project.outcome}</p> : null}
                <ul aria-label={`${project.title} technology stack`}>
                  {project.stack.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StrengthsSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-strengths" id="strengths" aria-labelledby="resume-strengths-title">
      <div className="resume-strengths-stage resume-shell" data-strengths-stage>
        <div className="resume-strengths-heading">
          <p className="resume-section-label">{content.strengthsSection.sectionLabel}</p>
          <h2 id="resume-strengths-title">
            {content.strengthsSection.title.split("\n").map((line) => <span key={line}>{line}</span>)}
          </h2>
          <p>{content.strengthsSection.introduction}</p>
        </div>

        <div className="resume-strength-list">
          <div className="resume-strength-glow" data-strength-glow aria-hidden="true" />
          {content.strengths.map((strength) => (
            <article key={strength.number} data-strength-item>
              <span>{strength.number}</span>
              <div>
                <h3>{strength.title}</h3>
                <p>{strength.description}</p>
                <ul>{strength.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-contact" id="contact" aria-labelledby="resume-contact-title">
      <div className="resume-contact-orbit" aria-hidden="true"><SignalIcon /></div>
      <div className="resume-grain" aria-hidden="true" />
      <div className="resume-shell">
        <p className="resume-section-label" data-contact-reveal>{content.contact.sectionLabel}</p>
        <h2 id="resume-contact-title" data-contact-title>
          {content.contact.title.map((line) => <span key={line}>{line}</span>)}
        </h2>
        <div className="resume-contact-bottom" data-contact-reveal>
          <p>{content.contact.statement}</p>
          <div className="resume-contact-actions">
            <a className="resume-primary-link" href={content.contact.emailHref}>
              {content.contact.emailLabel}<MailIcon />
            </a>
            <a className="resume-text-link" href={content.contact.githubHref} target="_blank" rel="noreferrer">
              {content.contact.githubLabel}<ArrowUpRightIcon />
            </a>
            <span className="resume-location"><SignalIcon />{content.contact.locationLabel} · {content.contact.location}</span>
          </div>
        </div>
        <footer className="resume-footer" data-contact-reveal>
          <span>{content.contact.footer}</span>
          <a href="#top">{content.contact.backToTopLabel}<ArrowUpRightIcon /></a>
        </footer>
      </div>
    </section>
  );
}
