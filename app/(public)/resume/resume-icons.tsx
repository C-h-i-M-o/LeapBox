import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6 18 18 6M8 6h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 2.8a9.4 9.4 0 0 0-3 18.3c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.3-.3-4.6-1.1-4.6-4.7 0-1 .4-1.9 1-2.6-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.6 0 3.6-2.3 4.4-4.6 4.7.4.3.7 1 .7 1.9v2.9c0 .3.2.6.7.5A9.4 9.4 0 0 0 12 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3.5 6.5h17v12h-17zM4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SignalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1" opacity=".45" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth=".75" opacity=".2" />
    </svg>
  );
}
