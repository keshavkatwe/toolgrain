/** Limit rendering without rounding animation positions or changing timeline speed. */
export function frameGate(fps: number) {
  const interval = 1000 / fps;
  let next = Number.NaN;
  return (now: number) => {
    if (Number.isNaN(next)) {
      next = now + interval;
      return true;
    }
    if (now + 0.1 < next) return false;
    next +=
      Math.max(1, Math.floor((now - next + 0.1) / interval) + 1) * interval;
    return true;
  };
}
