export function createAtmosphere(
  canvas: HTMLCanvasElement,
  hero: HTMLElement,
  light = false,
) {
  const context = canvas.getContext("2d");
  if (!context) return { draw: (_time: number) => {}, dispose: () => {} };
  const c = context;
  let width = 1;
  let height = 1;
  let time = 0;
  function draw(next: number) {
    time = next;
    const w = width,
      h = height,
      phase = time * 0.19;
    c.clearRect(0, 0, w, h);
    const cx = w * (0.76 + Math.sin(phase) * 0.1),
      cy = h * (0.4 + Math.cos(phase * 0.7) * 0.1);
    let gradient = c.createRadialGradient(cx, cy, 5, cx, cy, w * 0.65);
    gradient.addColorStop(0, light ? "#b1c0bc40" : "#6f808b5c");
    gradient.addColorStop(0.42, light ? "#d3dcd529" : "#4f5b6240");
    gradient.addColorStop(1, "#11161900");
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);
    gradient = c.createRadialGradient(
      w * 0.92,
      h * 0.8,
      0,
      w * 0.92,
      h * 0.8,
      w * 0.48,
    );
    gradient.addColorStop(0, light ? "#c9d79126" : "#b8b28a2c");
    gradient.addColorStop(0.5, "#78817413");
    gradient.addColorStop(1, "#00000000");
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);
    c.save();
    c.globalCompositeOperation = light ? "multiply" : "screen";
    for (let i = 0; i < 5; i++) {
      const offset = i * 28 + Math.sin(phase + i * 0.45) * 24;
      c.beginPath();
      c.moveTo(w * 0.13 + offset, -h * 0.22);
      c.bezierCurveTo(
        w * 0.3 + offset,
        h * 0.5,
        w * 0.8 - offset,
        h * 0.05,
        w * 1.1,
        h * 0.72 + offset,
      );
      const ribbon = c.createLinearGradient(w * 0.2, 0, w, h);
      ribbon.addColorStop(0, "#b5c8d000");
      ribbon.addColorStop(0.3, light ? "#687d7d0c" : "#b5c8d00c");
      ribbon.addColorStop(0.65, light ? "#70898516" : "#c6d4d31b");
      ribbon.addColorStop(1, "#c6d4d300");
      c.strokeStyle = ribbon;
      c.lineWidth = i === 2 ? 90 : 35;
      c.stroke();
    }
    c.restore();
    c.save();
    c.globalAlpha = 0.32;
    c.strokeStyle = light ? "#738782" : "#afc4ca";
    c.lineWidth = 0.45;
    for (let i = 0; i < 11; i++) {
      c.beginPath();
      c.moveTo(w * 0.48, h * 0.98 + i * 8);
      c.bezierCurveTo(
        w * 0.66,
        h * 0.76 + i * 10 + Math.sin(phase * 0.6) * 25,
        w * 0.86,
        h * 0.92 - i * 15,
        w * 1.08,
        h * 0.66 - i * 11,
      );
      c.stroke();
    }
    c.restore();
    for (let i = 0; i < 13; i++) {
      const x =
        w * (0.56 + ((i * 0.071 + Math.sin(time * 0.02) * 0.04 + 0.48) % 0.48));
      const y = h * (0.16 + ((i * 0.137) % 0.65)) + Math.sin(phase + i) * 9;
      c.beginPath();
      c.arc(x, y, i % 4 === 0 ? 1.1 : 0.6, 0, Math.PI * 2);
      c.fillStyle = light
        ? i % 4 === 0
          ? "#66752280"
          : "#6c807a55"
        : i % 4 === 0
          ? "#dce7a36b"
          : "#d5e0dd39";
      c.fill();
    }
  }
  const resize = () => {
    const box = hero.getBoundingClientRect();
    width = box.width;
    height = box.height;
    const ratio = Math.min(devicePixelRatio, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(time);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(hero);
  resize();
  return { draw, dispose: () => observer.disconnect() };
}
