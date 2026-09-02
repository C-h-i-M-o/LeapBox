import { useParticleTitle } from "./use-particle-title";
import { initialParticlePoints } from "./resume-motion-model";

export function ParticleTitle({ lines }: { lines: readonly string[] }) {
  const titleRef = useParticleTitle(lines);

  return (
    <h1 id="resume-hero-title" className="resume-particle-title" ref={titleRef} data-hero-title data-locale-copy>
      {lines.map((line, index) => (
        <span className="resume-particle-line" key={index} data-hero-line>
          <span className="resume-particle-fallback">{line}</span>
        </span>
      ))}
      <svg className="resume-particle-seed" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
        {initialParticlePoints.map((point, pointIndex) => <circle key={pointIndex} cx={point.x} cy={point.y} r="1.5" fill={pointIndex % 2 ? "#83e8c4" : "#eeeade"} />)}
      </svg>
      <canvas aria-hidden="true" />
    </h1>
  );
}
