import type { ResumeLocale } from "./resume-content";
import type { ResumeLoadingState } from "./resume-loading";

type ResumeLoaderProps = {
  state: ResumeLoadingState;
  progress: number;
  locale: ResumeLocale;
  retry: () => void;
};

export function ResumeLoader({ state, progress, locale, retry }: ResumeLoaderProps) {
  return (
    <div className="resume-loader" style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "#080a0a", color: "#eeeade" }} data-resume-loader aria-hidden={state === "ready"} inert={state === "ready"}>
      <div className="resume-loader-header">
        <span>LIU YILUN<span className="resume-loader-dot">.</span></span>
        <span>{locale === "zh" ? "个人作品集" : "SELECTED WORK"}</span>
      </div>
      <div className="resume-loader-center">
        <div className="resume-loader-orbit" aria-hidden="true"><span /></div>
        <p className="resume-loader-eyebrow">AI DEVELOPER · PORTFOLIO</p>
        <h2>{locale === "zh" ? "精彩，即将呈现" : "Almost there."}</h2>
        <div className="resume-loader-status" role="status" aria-live="polite">
          {state === "error"
            ? (locale === "zh" ? "加载暂未完成，请检查网络后重试。" : "Loading could not finish. Check your connection and try again.")
            : state === "preparing"
              ? (locale === "zh" ? "正在准备开场" : "Preparing the opening")
              : (locale === "zh" ? "正在准备图片、影像与交互" : "Preparing images, film and interactions")}
        </div>
        <div className="resume-loader-progress" role="progressbar" aria-label={locale === "zh" ? "资源准备进度" : "Resource preparation"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="resume-loader-progress-caption" aria-hidden="true"><span>{locale === "zh" ? "准备进度" : "PREPARING"}</span><span>{progress}<small>%</small></span></div>
        {state === "error" ? <button className="resume-loader-retry" type="button" onClick={retry}>{locale === "zh" ? "重新加载" : "Try again"}<span aria-hidden="true">↗</span></button> : null}
        <noscript><p className="resume-loader-noscript">请启用 JavaScript 后刷新，以加载完整简历。 / Please enable JavaScript and reload.</p></noscript>
      </div>
      <div className="resume-loader-footer"><span>IDEAS INTO REALITY</span><span>LIU YILUN / AI DEVELOPER</span></div>
    </div>
  );
}
