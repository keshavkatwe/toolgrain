import { useEffect, useRef, useSyncExternalStore } from "react";
import { frameGate } from "../../lib/frame-gate";
import styles from "./styles.module.css";

let paused = false;
const subscribers = new Set<() => void>();
const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};
export function useMotionPause(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => paused,
    () => false,
  );
  return [
    value,
    (next) => {
      paused = next;
      for (const listener of subscribers) listener();
    },
  ];
}
export function MotionControl() {
  const [isPaused, setPaused] = useMotionPause();
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      document.documentElement.dataset.motionPaused = String(
        isPaused || document.hidden || media.matches,
      );
    };
    update();
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, [isPaused]);
  return (
    <button
      className={styles.control}
      type="button"
      onClick={() => setPaused(!isPaused)}
      aria-pressed={isPaused}
    >
      {isPaused ? "▶ Resume motion" : "Ⅱ Pause motion"}
    </button>
  );
}

export default function MotionField({
  variant = "flow",
}: {
  variant?: "flow" | "orbit" | "footer";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [isPaused] = useMotionPause();
  const clock = useRef(0);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const c = context;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 1,
      height = 1,
      raf = 0,
      previous = 0,
      elapsed = clock.current,
      visible = false;
    const samples = 64;
    const xs = new Float64Array(samples + 1);
    const ys = new Float64Array(samples + 1);
    const lengths = new Float64Array(samples + 1);
    let light = document.documentElement.dataset.theme === "light";
    const halo = document.createElement("canvas");
    halo.width = halo.height = 40;
    const haloContext = halo.getContext("2d");
    function refreshTheme() {
      light = document.documentElement.dataset.theme === "light";
      if (haloContext) {
        haloContext.clearRect(0, 0, 40, 40);
        const glow = haloContext.createRadialGradient(
          20,
          20,
          0,
          20,
          20,
          variant === "footer" ? 18 : 10,
        );
        glow.addColorStop(0, light ? "#71873899" : "#dceaa8cc");
        glow.addColorStop(1, "#cce88400");
        haloContext.fillStyle = glow;
        haloContext.fillRect(0, 0, 40, 40);
      }
    }
    refreshTheme();
    function draw() {
      c.clearRect(0, 0, width, height);
      const footer = variant === "footer";
      const t = elapsed * 0.00023;
      const ink = light ? "91,112,98" : "177,202,192";
      const glow = c.createRadialGradient(
        width * (0.55 + Math.sin(t) * 0.18),
        height * 0.55,
        0,
        width * 0.6,
        height * 0.5,
        width * 0.6,
      );
      glow.addColorStop(0, `rgba(${ink},${footer ? 0.16 : 0.07})`);
      glow.addColorStop(1, `rgba(${ink},0)`);
      c.fillStyle = glow;
      c.fillRect(0, 0, width, height);
      for (let line = 0; line < (footer ? 18 : 9); line++) {
        c.beginPath();
        for (let i = 0; i <= samples; i++) {
          const p = i / samples;
          const x = width * p;
          const y =
            variant === "orbit"
              ? height * 0.5 +
                Math.sin(p * Math.PI * 2 + t + line * 0.07) * height * 0.32
              : height *
                  (0.45 + 0.18 * Math.sin(p * Math.PI * 2 + t + line * 0.045)) +
                (line - 12) * (footer ? 5 : 3) +
                Math.cos(p * 5 - t * 0.7) * height * 0.11;
          xs[i] = x;
          ys[i] = y;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.strokeStyle = `rgba(${ink},${footer ? 0.13 + 0.1 * Math.sin((line / 24) * Math.PI) : 0.2})`;
        c.lineWidth = line % 6 === 0 ? 1.2 : 0.5;
        c.stroke();
        if (line % 3 === 0) {
          const p = (elapsed * 0.000035 + line * 0.107) % 1;
          // Interpolate along the ribbon's length instead of snapping to a vertex.
          lengths[0] = 0;
          for (let i = 1; i <= samples; i++) {
            lengths[i] =
              lengths[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
          }
          const distance = p * lengths[samples];
          let segment = 1;
          while (segment < samples && lengths[segment] < distance) segment++;
          const fraction =
            (distance - lengths[segment - 1]) /
            (lengths[segment] - lengths[segment - 1] || 1);
          const x =
            xs[segment - 1] + (xs[segment] - xs[segment - 1]) * fraction;
          const y =
            ys[segment - 1] + (ys[segment] - ys[segment - 1]) * fraction;
          c.drawImage(halo, x - 20, y - 20);
          c.fillStyle = light ? "#617923" : "#e5efb8";
          c.beginPath();
          c.arc(x, y, 1.6, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    let canDraw = frameGate(60);
    function tick(now: number) {
      if (!canDraw(now)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      elapsed += previous ? Math.min(now - previous, 50) : 0;
      previous = now;
      clock.current = elapsed;
      draw();
      raf = requestAnimationFrame(tick);
    }
    function update() {
      cancelAnimationFrame(raf);
      previous = 0;
      canDraw = frameGate(60);
      if (visible && !isPaused && !document.hidden && !media.matches)
        raf = requestAnimationFrame(tick);
      else draw();
    }
    const resize = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(devicePixelRatio, 1);
      element.width = width * ratio;
      element.height = height * ratio;
      c.setTransform(ratio, 0, 0, ratio, 0, 0);
      update();
    });
    resize.observe(element);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    const theme = new MutationObserver(() => {
      refreshTheme();
      draw();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      observer.disconnect();
      theme.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [isPaused, variant]);
  return (
    <canvas
      ref={canvas}
      className={styles.canvas}
      role="img"
      aria-label="Decorative flowing signal ribbons"
    />
  );
}
