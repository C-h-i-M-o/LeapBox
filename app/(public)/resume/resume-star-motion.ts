/** 使用空间进度编排，停下来阅读不会自动聚合。 */
export function smoothStarProgress(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function getTransitionGather(progress: number): number {
  return smoothStarProgress(0, .18, progress) * (1 - smoothStarProgress(.58, .8, progress));
}

export function getHeroScatter(top: number, height: number): number {
  // 第四段触发完整散开，时间缓动由渲染层完成，不停留在半散开状态。
  return -top / Math.max(1, height) >= .43 ? 1 : 0;
}

export function getHeroTurn(top: number, height: number): number {
  const progress = -top / Math.max(1, height);
  return (Math.PI / 6) * smoothStarProgress(0, .12, progress)
    + (Math.PI / 6) * smoothStarProgress(.12, .24, progress)
    + (Math.PI / 6) * smoothStarProgress(.24, .36, progress);
}

export function returnStarRotation(value: number, initial: number, delta: number): number {
  return initial + (value - initial) * Math.exp(-Math.max(0, delta) * 4);
}

/** 仰视终点消除拖动的额外偏转，保证最终观察角度不会超过九十度。 */
export function getHeroDragWeight(turn: number): number {
  return 1 - smoothStarProgress(Math.PI / 3, Math.PI / 2, turn);
}

/** 短时柔和追随，足够接近时精确落位，不留下不足九十度的尾差。 */
export function smoothHeroTurn(current: number, target: number, seconds: number): number {
  const goal = Math.max(0, Math.min(Math.PI / 2, target));
  const next = current + (goal - current) * (1 - Math.exp(-Math.max(0, seconds) * 18));
  return Math.abs(goal - next) < Math.PI / 1800 ? goal : Math.max(0, Math.min(Math.PI / 2, next));
}

export function getHeroIntro(seconds: number): number {
  return 1 - smoothStarProgress(.2, 2, seconds);
}
