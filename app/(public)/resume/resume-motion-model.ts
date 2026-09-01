export function getAwardRingRotation(index: number, total: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const normalizedIndex = ((index % total) + total) % total;
  return normalizedIndex * (360 / total);
}
