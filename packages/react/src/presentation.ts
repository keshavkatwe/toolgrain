import type { AppClient } from "./client.js";

/** Own only the styles/observer installed by this provider; restore on teardown. */
export function presentation(
  client: AppClient,
  browser: Window,
  styles: boolean,
  resize: boolean,
) {
  const root = browser.document.documentElement;
  const previous = new Map<string, { value: string; priority: string }>();
  let fonts: HTMLStyleElement | undefined;
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  let context: unknown;
  let disposed = false;
  let lastSize = "";
  const restore = () => {
    for (const [key, value] of previous) {
      if (value.value) root.style.setProperty(key, value.value, value.priority);
      else root.style.removeProperty(key);
    }
    previous.clear();
    fonts?.remove();
    fonts = undefined;
  };
  const set = (key: string, value: string) => {
    previous.set(key, {
      value: root.style.getPropertyValue(key),
      priority: root.style.getPropertyPriority(key),
    });
    root.style.setProperty(key, value);
  };
  const measure = () => {
    frame = undefined;
    const body = browser.document.body;
    const width = Math.ceil(
      Math.max(
        root.scrollWidth,
        body.scrollWidth,
        body.getBoundingClientRect().width,
      ),
    );
    const height = Math.ceil(
      Math.max(
        // scrollHeight on the root is at least the iframe viewport height,
        // which would prevent a flexible view from ever shrinking again.
        root.getBoundingClientRect().height,
        body.scrollHeight,
        body.getBoundingClientRect().height,
      ),
    );
    const size = `${width}:${height}`;
    if (size !== lastSize) {
      lastSize = size;
      client.size(width, height);
    }
  };
  const schedule = () => {
    if (frame !== undefined) return;
    if (browser.requestAnimationFrame)
      frame = browser.requestAnimationFrame(measure);
    else measure();
  };
  const dispose = () => {
    disposed = true;
    restore();
    observer?.disconnect();
    if (frame !== undefined) browser.cancelAnimationFrame(frame);
  };
  const update = () => {
    const snapshot = client.getSnapshot();
    if (client.isClosed()) {
      dispose();
      return;
    }
    if (disposed || snapshot.status === "connecting") return;
    if (styles && context !== snapshot.host) {
      context = snapshot.host;
      restore();
      for (const [key, value] of Object.entries(
        snapshot.host.styles?.variables ?? {},
      )) {
        if (/^--[A-Za-z0-9_-]+$/.test(key) && value !== undefined)
          set(key, value);
      }
      if (snapshot.host.theme) set("color-scheme", snapshot.host.theme);
      const css = snapshot.host.styles?.css?.fonts;
      if (css) {
        fonts = browser.document.createElement("style");
        fonts.textContent = css;
        browser.document.head.append(fonts);
      }
    }
    const Observer = (
      browser as unknown as { ResizeObserver?: typeof ResizeObserver }
    ).ResizeObserver;
    if (resize && !observer && Observer) {
      observer = new Observer(schedule);
      observer.observe(root);
      observer.observe(browser.document.body);
      schedule();
    }
  };
  const unsubscribe = client.subscribe(update);
  update();
  return () => {
    unsubscribe();
    dispose();
  };
}
