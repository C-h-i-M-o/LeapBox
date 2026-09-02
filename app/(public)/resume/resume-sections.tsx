import type { ResumeContent, ResumeLocale } from "./resume-content.ts";
import type { ResumeInteractionContent } from "./resume-interaction-content";
import { ParticleTitle } from "./particle-title";
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
type InteractiveSectionProps = SharedSectionProps & { interaction: ResumeInteractionContent };

type NavigationProps = SharedSectionProps & {
  locale: ResumeLocale;
  toggleLocale: () => void;
};

export function ResumeNavigation({ content, locale, toggleLocale }: NavigationProps) {
  return (
    <header className="resume-nav" data-hero-reveal>
      <a className="resume-brand" href="#top" aria-label={content.navigation.brand}>
        <img className="resume-brand-mark" src="/resume/personal-mark-128-v1.png" width={40} height={40} alt="" aria-hidden="true" />
        <span>{content.navigation.brand}</span>
      </a>
      <nav className="resume-nav-links" aria-label={locale === "zh" ? "作品集导航" : "Portfolio navigation"}>
        {content.navigation.links.map((link) => (
          <a key={link.href} href={link.href} data-nav-link><span>{link.label}</span></a>
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
        <a className="resume-contact-button" href="#contact" data-magnetic>
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
        <video muted loop playsInline preload="none" poster="/resume/hero-poster.jpg" data-hero-video>
          <source src="/resume/hero-data-flow.mp4" type="video/mp4" />
        </video>
        <div className="resume-hero-shade" />
        <div className="resume-grain" />
      </div>
      <div className="resume-hero-signal" aria-hidden="true" data-hero-signal><SignalIcon /></div>
      <div className="resume-hero-content resume-shell">
        <div className="resume-hero-kicker" data-hero-reveal data-locale-copy>
          <span>{content.hero.role}</span>
          <span>{content.hero.eyebrow}</span>
        </div>
        <ParticleTitle lines={content.hero.title} />
        <div className="resume-hero-bottom" data-hero-reveal data-locale-copy>
          <p>{content.hero.statement}</p>
        </div>
        <div className="resume-hero-meta" data-hero-reveal>
          <a href="#about"><ArrowDownIcon />{content.hero.scrollLabel}</a>
        </div>
      </div>
    </section>
  );
}

function TechTrack({ content }: SharedSectionProps) {
  return (
    <div className="resume-tech-row" data-tech-track>
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

function AwardTrack({ content }: SharedSectionProps) {
  return (
    <div className="resume-tech-row is-reverse resume-award-track" data-award-track>
      {[0, 1].map((copyIndex) => (
        <div className="resume-tech-track" key={copyIndex} aria-hidden={copyIndex === 1}>
          {content.awards.items.map((award, index) => (
            <span className="resume-award-ticker-item" key={index}>
              <time>{award.period}</time>
              <strong>{award.title}</strong>
              {award.distinction ? <small>{award.distinction}</small> : null}
              <i aria-hidden="true" />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AboutSection({ content, interaction }: InteractiveSectionProps) {
  return (
    <section className="resume-about" id="about" aria-labelledby="resume-about-title">
      <div className="resume-about-stage" data-about-stage>
        <div className="resume-about-main resume-shell">
          <h2 className="resume-visually-hidden" id="resume-about-title">{content.about.title}</h2>
          <div className="resume-chapter-switch" aria-label={content.about.title} data-enter-group>
            {interaction.aboutLabels.map((label, index) => (
              <button type="button" key={index} data-about-select={index} aria-pressed={index === 0} data-enter-item>
                <span>0{index + 1}</span>{label}<i aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="resume-about-layout">
            <figure className="resume-portrait" data-about-portrait data-tilt>
              <img src="/resume/portrait-line.webp" alt={content.about.portraitAlt} loading="lazy" decoding="async" width={1024} height={1536} />
              <div className="resume-portrait-scan" data-about-scan aria-hidden="true" />
              <figcaption><SignalIcon />{content.about.location}</figcaption>
            </figure>

            <div className="resume-about-panels" data-locale-copy>
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
                <article className="resume-about-panel resume-experience-panel" key={index} data-about-panel>
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

        <div className="resume-tech-marquee">
          <TechTrack content={content} />
          <AwardTrack content={content} />
        </div>
      </div>
    </section>
  );
}

export function ProjectsSection({ content }: SharedSectionProps) {
  return (
    <section className="resume-projects" id="work" aria-labelledby="resume-work-title">
      <div className="resume-shell">
        <div className="resume-section-heading" data-locale-copy data-enter-group>
          <p className="resume-section-label" data-enter-item>{content.projectSection.sectionLabel}</p>
          <h2 id="resume-work-title" data-enter-item>
            {content.projectSection.title.split("\n").map((line, index) => <span key={index}>{line}</span>)}
          </h2>
          <p data-enter-item>{content.projectSection.introduction}</p>
        </div>

        <div className="resume-project-stack">
          {content.projects.map((project) => (
            <article className="resume-project-card" key={project.number} data-project-card>
              <div className="resume-project-image" data-project-image data-tilt>
                <img src={project.image} alt={project.imageAlt} loading="lazy" decoding="async" width={project.imageWidth} height={project.imageHeight} />
              </div>
              <div className="resume-project-copy" data-project-copy data-enter-group>
                <div className="resume-project-title-row" data-locale-copy data-enter-item>
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
                      data-magnetic
                    >
                      <ArrowUpRightIcon />
                    </a>
                  ) : <span className="resume-private-badge">{content.projectSection.privateProjectLabel}</span>}
                </div>
                <p className="resume-project-description" data-locale-copy data-enter-item>{project.description}</p>
                {project.outcome ? <p className="resume-project-outcome" data-locale-copy data-enter-item><SignalIcon />{project.outcome}</p> : null}
                <ul aria-label={`${project.title} technology stack`} data-enter-item>
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
        <div className="resume-strengths-heading" data-locale-copy data-enter-group>
          <p className="resume-section-label" data-enter-item>{content.strengthsSection.sectionLabel}</p>
          <h2 id="resume-strengths-title" data-enter-item>
            {content.strengthsSection.title.split("\n").map((line, index) => <span key={index}>{line}</span>)}
          </h2>
          <p data-enter-item>{content.strengthsSection.introduction}</p>
        </div>

        <div className="resume-strength-list">
          <div className="resume-strength-glow" data-strength-glow aria-hidden="true" />
          {content.strengths.map((strength, index) => (
            <article key={strength.number} data-strength-item>
              <span>{strength.number}</span>
              <div data-locale-copy>
                <h3><button type="button" data-strength-select={index} aria-pressed={index === 0}>{strength.title}<span aria-hidden="true">↗</span></button></h3>
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
        <h2 id="resume-contact-title" data-contact-title data-locale-copy>
          {content.contact.title.map((line, index) => <span key={index}>{line}</span>)}
        </h2>
        <div className="resume-contact-bottom" data-contact-reveal>
          <p data-locale-copy>{content.contact.statement}</p>
          <div className="resume-contact-actions">
            <a className="resume-primary-link" href={content.contact.emailHref} data-magnetic data-enter-item data-contact-action>
              {content.contact.emailLabel}<MailIcon />
            </a>
            <a className="resume-text-link" href={content.contact.githubHref} target="_blank" rel="noreferrer" data-magnetic data-enter-item data-contact-action>
              {content.contact.githubLabel}<ArrowUpRightIcon />
            </a>
            <span className="resume-location" data-enter-item data-contact-action><SignalIcon />{content.contact.locationLabel} · {content.contact.location}</span>
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
