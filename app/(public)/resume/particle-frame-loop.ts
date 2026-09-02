/** 稳定时彻底停止申请帧，交互重新唤醒；高刷屏保持约 60 次绘制/秒。 */
export function createParticleLoop(render: (time: number, dt: number) => boolean): {
  start: () => void;
  stop: () => void;
} {
  let frame = 0;
  let previous: number | undefined;
  let next = 0;
  const interval = 1000 / 60;
  const tick = (time: number) => {
    frame = 0;
    if (time + 0.5 < next) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const dt = previous === undefined ? 1 : Math.min(2, Math.max(0.25, (time - previous) / interval));
    next = previous === undefined ? time + interval : Math.max(next + interval, time);
    previous = time;
    if (render(time, dt)) frame = requestAnimationFrame(tick);
    else { previous = undefined; next = 0; }
  };
  return {
    start: () => { if (!frame) frame = requestAnimationFrame(tick); },
    stop: () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = undefined;
      next = 0;
    },
  };
}
