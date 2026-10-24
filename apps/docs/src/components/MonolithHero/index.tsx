import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import motion from "@site/src/generated/motion.json";
import { useEffect, useRef, useState } from "react";
import { frameGate } from "../../lib/frame-gate";
import { useMotionPause } from "../MotionField";
import { createAtmosphere } from "./atmosphere";
import { createScene, type HeroFrame } from "./scene";
import styles from "./styles.module.css";

const phaseNames = ["Ready", "Define", "Validate", "Execute", "Return"];
export default function MonolithHero() {
  const [light, setLight] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef({ ambient: 0, call: 0 });
  const appliedRestart = useRef(0);
  const latestFrame = useRef<HeroFrame>({
    p: 0,
    time: 0,
    route: "http",
    reduced: false,
    light: false,
  });
  const [route, setRoute] = useState<"http" | "stdio">("http");
  const [paused, setPaused] = useMotionPause();
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState(0);
  const [restart, setRestart] = useState(0);
  const mark = useBaseUrl(
    light ? "/brand/mark-light.svg" : "/brand/mark-dark.svg",
  );

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setLight(root.dataset.theme === "light");
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const element = hero.current;
    if (!element) return;
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!hero.current || !host.current) return;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    void createScene(hero.current, host.current, controller.signal).then(
      (cleanup) => {
        if (controller.signal.aborted) cleanup();
        else {
          dispose = cleanup;
          hero.current?.dispatchEvent(
            new CustomEvent("tg-frame", { detail: latestFrame.current }),
          );
        }
      },
    );
    return () => {
      controller.abort();
      dispose?.();
    };
  }, []);
  useEffect(() => {
    const element = hero.current,
      background = canvas.current;
    if (!element || !background) return;
    const atmosphere = createAtmosphere(background, element, light);
    if (appliedRestart.current !== restart) {
      clock.current.call = 0;
      appliedRestart.current = restart;
    }
    let frame = 0,
      last = performance.now(),
      lastPhase = -1;
    const sceneFrame = frameGate(60);
    const backgroundFrame = frameGate(30);
    const render = (now: number) => {
      const active = !reduced && !paused && visible;
      if (active && !sceneFrame(now)) {
        frame = requestAnimationFrame(render);
        return;
      }
      const delta = Math.min(now - last, 100);
      last = now;
      if (!reduced && !paused && visible) {
        clock.current.ambient += delta;
        clock.current.call += delta;
      }
      const p = reduced
        ? 1
        : (clock.current.call % motion.callDurationMs) / motion.callDurationMs;
      const next =
        p < 0.16 ? 0 : p < 0.35 ? 1 : p < 0.55 ? 2 : p < 0.77 ? 3 : 4;
      if (next !== lastPhase) {
        setPhase(next);
        lastPhase = next;
      }
      const detail: HeroFrame = {
        p,
        time: reduced ? 0 : clock.current.ambient / 1000,
        route,
        reduced,
        light,
      };
      latestFrame.current = detail;
      element.dispatchEvent(new CustomEvent("tg-frame", { detail }));
      if (!active || backgroundFrame(now)) atmosphere.draw(detail.time);
      if (!reduced && !paused && visible) frame = requestAnimationFrame(render);
    };
    render(last);
    return () => {
      cancelAnimationFrame(frame);
      atmosphere.dispose();
    };
  }, [paused, reduced, visible, route, restart, light]);
  function changeRoute(value: "http" | "stdio") {
    clock.current.call = 0;
    setRoute(value);
  }
  return (
    <section ref={hero} className={styles.hero} aria-labelledby="hero-heading">
      <canvas
        ref={canvas}
        className={styles.atmosphere}
        role="img"
        aria-label="Decorative flowing silver light"
      />
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span /> Typed tools for MCP servers
        </p>
        <div className={styles.grid}>
          <div className={styles.copy}>
            <h1 id="hero-heading">
              Less ceremony.
              <br />
              More capability.
            </h1>
            <p className={styles.intro}>
              Define typed tools. Build MCP servers.
              <br />
              Choose stdio or HTTP.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/docs/getting-started/stdio">
                Get started <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.secondary} to="/docs/introduction">
                Read the docs ↗
              </Link>
            </div>
          </div>
          <div ref={host} className="tg-scene">
            <img
              className="tg-sculpture"
              src={mark}
              alt="Toolgrain's monolithic routing mark"
              width="200"
              height="260"
            />
            <span className="tg-input-label">TypeScript</span>
            <span className="tg-stdio-label">stdio</span>
            <span className="tg-http-label">HTTP</span>
            <span className="tg-call-tag" data-visible={phase >= 2}>
              {phase === 2
                ? "Valid input"
                : phase === 3
                  ? "greet(input)"
                  : "Hello, Ada!"}
            </span>
            <div className="tg-controls">
              <fieldset className="tg-route">
                <legend className="sr-only">Preview transport</legend>
                {(["stdio", "http"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={route === value}
                    onClick={() => changeRoute(value)}
                  >
                    {value === "http" ? "HTTP" : value}
                  </button>
                ))}
              </fieldset>
              <div className="tg-playback">
                {reduced ? (
                  <span>Reduced motion</span>
                ) : (
                  <button type="button" onClick={() => setPaused(!paused)}>
                    {paused ? "Play" : "Pause"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={reduced}
                  onClick={() => {
                    clock.current.call = 0;
                    setPaused(false);
                    setRestart((value) => value + 1);
                  }}
                >
                  ↻ Restart
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.caption}>
          <span>
            A small definition.
            <br />
            An open world.
          </span>
          <div className={styles.phases}>
            {phaseNames.map((name, index) => (
              <span key={name} data-active={phase === index}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
