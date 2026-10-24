import type * as Three from "three";
export interface HeroFrame {
  p: number;
  time: number;
  route: "http" | "stdio";
  reduced: boolean;
  light: boolean;
}
export async function createScene(
  root: HTMLElement,
  host: HTMLElement,
  signal: AbortSignal,
): Promise<() => void> {
  try {
    const T = await import("three");
    if (signal.aborted) return () => {};
    const mount = document.createElement("div");
    mount.className = "tg-webgl";
    mount.setAttribute("aria-hidden", "true");
    host.prepend(mount);
    const floating = document.createElement("div");
    floating.className = "tg-floating";
    floating.innerHTML =
      "greet.ts <span>· typed</span><strong>tool({ input, execute })</strong>";
    host.append(floating);
    const sideLabel = document.createElement("div");
    sideLabel.className = "tg-orbit-label";
    sideLabel.textContent = "";
    sideLabel.setAttribute("aria-hidden", "true");
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(35, 1, 0.1, 80);
    camera.position.set(3.25, 1.35, 10.9);
    camera.lookAt(0.15, 0, 0);
    const renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    renderer.setClearColor(0, 0);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.append(renderer.domElement);
    const studio = new T.Scene();
    studio.background = new T.Color("#242a2b");
    function softbox(
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      color: string,
      power: number,
    ) {
      const panel = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshBasicMaterial({
          color: new T.Color(color).multiplyScalar(power),
          side: T.DoubleSide,
        }),
      );
      panel.position.set(x, y, z);
      panel.lookAt(0, 0, 0);
      studio.add(panel);
    }
    softbox(3, 8, -4, 2, 3, "#f9faf0", 5);
    softbox(1, 9, 4, 1, 2, "#dfe6ed", 4);
    softbox(8, 2, 0, 5, -1, "#ffffff", 6);
    softbox(1.5, 7, 2, 0, -4, "#b3c3ca", 3);
    softbox(5, 2, 0, -3, 4, "#c9cdd1", 2);
    softbox(7, 2, 0, 1.6, 6, "#ffffff", 5);
    softbox(1, 7, -1.8, 0, 5, "#eaf0f7", 3);
    const pmrem = new T.PMREMGenerator(renderer),
      env = pmrem.fromScene(studio, 0.04);
    scene.environment = env.texture;
    scene.add(new T.HemisphereLight("#dde9e8", "#33372e", 1));
    const key = new T.DirectionalLight("#fffbe9", 4);
    key.position.set(-4, 6, 5);
    scene.add(key);
    const rim = new T.DirectionalLight("#b6d2e4", 2);
    rim.position.set(4, 1, -2);
    scene.add(rim);
    const group = new T.Group();
    scene.add(group);
    const shape = new T.Shape();
    shape.moveTo(-0.4, 2.0);
    shape.lineTo(0.33, 2.0);
    shape.lineTo(0.33, 0.83);
    shape.bezierCurveTo(0.33, 0.52, 0.5, 0.39, 0.8, 0.39);
    shape.lineTo(1.15, 0.39);
    shape.lineTo(1.15, -0.24);
    shape.lineTo(0.34, -0.24);
    shape.lineTo(0.34, -1.16);
    shape.bezierCurveTo(0.34, -1.46, 0.52, -1.59, 0.82, -1.59);
    shape.lineTo(1.2, -1.59);
    shape.lineTo(1.2, -2.18);
    shape.lineTo(0.58, -2.18);
    shape.bezierCurveTo(-0.2, -2.18, -0.45, -1.78, -0.45, -1.13);
    shape.lineTo(-0.45, -0.24);
    shape.lineTo(-1.1, -0.24);
    shape.lineTo(-1.1, 0.39);
    shape.lineTo(-0.4, 0.39);
    shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: 0.55,
      bevelEnabled: true,
      bevelSize: 0.115,
      bevelThickness: 0.12,
      bevelSegments: 8,
      steps: 1,
      curveSegments: 24,
    });
    geometry.translate(-0.13, 0.05, -0.28);
    const metal = new T.MeshPhysicalMaterial({
      color: "#dedfdf",
      metalness: 1,
      roughness: 0.2,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.25,
    });
    const sculpture = new T.Mesh(geometry, metal);
    group.add(sculpture);
    const edge = new T.LineSegments(
      new T.EdgesGeometry(geometry, 35),
      new T.LineBasicMaterial({
        color: "#eaf0d4",
        transparent: true,
        opacity: 0.12,
      }),
    );
    group.add(edge);
    const curves = {} as Record<"http" | "stdio", Three.CatmullRomCurve3>;
    for (const route of ["http", "stdio"] as const) {
      const target = route === "http" ? -0.7 : 0.6;
      curves[route] = new T.CatmullRomCurve3(
        [
          new T.Vector3(-3.7, -0.9, 0.48),
          new T.Vector3(-2, -0.9, 0.48),
          new T.Vector3(-0.93, -0.75, 0.5),
          new T.Vector3(-0.65, -0.02, 0.56),
          new T.Vector3(0.2, 0.07, 0.57),
          new T.Vector3(1.15, target, 0.47),
          new T.Vector3(3.35, target, 0.38),
        ],
        false,
        "centripetal",
      );
      for (let j = 0; j < 5; j++) {
        const points = curves[route]
          .getPoints(80)
          .map(
            (p) =>
              new T.Vector3(
                p.x,
                p.y + (j - 2) * 0.065,
                p.z - 0.02 * Math.abs(j - 2),
              ),
          );
        const curve = new T.CatmullRomCurve3(points);
        const tube = new T.Mesh(
          new T.TubeGeometry(curve, 64, 0.008, 5, false),
          new T.MeshStandardMaterial({
            color: j === 2 ? "#b2b8a0" : "#535f5b",
            metalness: 0.75,
            roughness: 0.4,
            transparent: true,
            opacity: j === 2 ? 0.85 : 0.42,
          }),
        );
        group.add(tube);
      }
    }
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const ctx = glowCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const radial = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    radial.addColorStop(0, "rgba(240,255,145,1)");
    radial.addColorStop(0.12, "rgba(220,240,95,.75)");
    radial.addColorStop(0.4, "rgba(210,230,80,.12)");
    radial.addColorStop(1, "rgba(210,230,80,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 128, 128);
    const glowTexture = new T.CanvasTexture(glowCanvas);
    const packets: Three.Group[] = [];
    for (let i = 0; i < 10; i++) {
      const g = new T.Group();
      g.add(
        new T.Mesh(
          new T.SphereGeometry(i === 0 ? 0.078 : 0.027, 14, 10),
          new T.MeshBasicMaterial({ color: i === 0 ? "#f2ffae" : "#d2e277" }),
        ),
      );
      const aura = new T.Sprite(
        new T.SpriteMaterial({
          map: glowTexture,
          color: "#e7ef9c",
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          opacity: i === 0 ? 1 : 0.35,
        }),
      );
      aura.scale.setScalar(i === 0 ? 0.8 : 0.32);
      g.add(aura);
      group.add(g);
      packets.push(g);
    }
    const finish = new T.Group();
    group.add(finish);
    const sparks: Three.Sprite[] = [];
    for (let i = 0; i < 16; i++) {
      const sprite = new T.Sprite(
        new T.SpriteMaterial({
          map: glowTexture,
          color: i % 3 === 0 ? "#ffffff" : "#e8f39d",
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      finish.add(sprite);
      sparks.push(sprite);
    }
    const ping = new T.Mesh(
      new T.TorusGeometry(0.16, 0.008, 7, 70),
      new T.MeshBasicMaterial({
        color: "#e5ef9e",
        transparent: true,
        opacity: 0,
      }),
    );
    group.add(ping);
    const trailGeo = new T.BufferGeometry();
    const positions = new Float32Array(81 * 3);
    trailGeo.setAttribute("position", new T.BufferAttribute(positions, 3));
    const trace = new T.Line(
      trailGeo,
      new T.LineBasicMaterial({
        color: "#dfea8a",
        transparent: true,
        opacity: 0.8,
      }),
    );
    group.add(trace);
    const dotLight = new T.PointLight("#e4ef8c", 0, 2.7, 2);
    group.add(dotLight);
    const orbitPoints = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * Math.PI * 1.65;
      orbitPoints.push(
        new T.Vector3(
          Math.cos(a) * 2.75,
          Math.sin(a) * 1.9,
          Math.sin(a) * -0.7 - 0.3,
        ),
      );
    }
    const orbit = new T.Line(
      new T.BufferGeometry().setFromPoints(orbitPoints),
      new T.LineDashedMaterial({
        color: "#b1bca2",
        transparent: true,
        opacity: 0.14,
        dashSize: 0.025,
        gapSize: 0.16,
      }),
    );
    orbit.computeLineDistances();
    group.add(orbit);
    const shadow = new T.Sprite(
      new T.SpriteMaterial({
        map: glowTexture,
        color: "#747c68",
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      }),
    );
    shadow.position.set(0.5, -2.5, -0.6);
    shadow.scale.set(4, 0.5, 1);
    scene.add(shadow);
    let progress = 0,
      time = 0,
      route: "http" | "stdio" = "http",
      reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pointerX = 0,
      pointerY = 0,
      smoothedX = 0,
      smoothedY = 0;
    function render() {
      smoothedX += (pointerX - smoothedX) * 0.12;
      smoothedY += (pointerY - smoothedY) * 0.12;
      const moving = !reduced && progress < 1;
      const wave = moving ? (1 - Math.cos(progress * Math.PI * 2)) * 0.5 : 0;
      const hit = 0;
      const hop = moving ? (1 - Math.cos(progress * Math.PI * 2)) * 0.18 : 0;
      const settle = 0;
      const idle = reduced ? 0 : Math.sin(time * 0.7);
      group.rotation.y = -0.22 + wave * 0.42 + smoothedX * 0.35 + idle * 0.025;
      group.rotation.x = 0.025 + hop * 0.06 + smoothedY * 0.2;
      group.rotation.z =
        (moving
          ? Math.sin(progress * Math.PI * 2) * 0.05 + hit * 0.03 + settle * 0.12
          : 0) +
        idle * 0.007;
      group.position.y =
        wave * 0.07 + hop * 0.17 + settle * 0.13 + idle * 0.035;
      sculpture.scale.set(1 + hop * 0.018, 1 - hit * 0.02 + hop * 0.025, 1);
      edge.scale.copy(sculpture.scale);
      orbit.rotation.z = reduced ? 0.5 : time * 0.025;
      const curve = curves[route];
      const t = progress;
      packets.forEach((g, i) => {
        const n = reduced
          ? Math.max(0, 1 - i * 0.021)
          : (t - i * 0.021 + 1) % 1;
        g.visible = true;
        g.position.copy(curve.getPointAt(Math.max(0, Math.min(1, n))));
        if (i > 0) {
          const dance = Math.sin(progress * Math.PI);
          g.position.y += Math.sin(progress * 35 + i * 0.9) * 0.065 * dance;
          g.position.z += Math.cos(progress * 25 + i) * 0.06 * dance;
        }
        const edgeFade = Math.min(1, n / 0.055, (1 - n) / 0.055);
        const fade = edgeFade * edgeFade * (3 - 2 * edgeFade);
        g.scale.setScalar(reduced ? 1 : fade);
      });
      dotLight.position.copy(packets[0].position);
      dotLight.intensity = reduced
        ? 0
        : 2.8 * Math.min(1, t / 0.055, (1 - t) / 0.055);
      const celebration = !reduced ? Math.max(0, (progress - 0.88) / 0.12) : 1;
      const endpoint = curve.getPointAt(1);
      finish.position.copy(endpoint);
      sparks.forEach((s, i) => {
        const angle = (i / 16) * Math.PI * 2;
        s.visible = celebration > 0 && celebration < 1;
        s.position.set(
          Math.cos(angle) * celebration * 0.65,
          Math.sin(angle) * celebration * 0.65,
          Math.sin(angle * 2) * celebration * 0.2,
        );
        s.scale.setScalar(0.22 * (1 - celebration) + 0.03);
        s.material.opacity = Math.sin(Math.PI * celebration) ** 2 * 0.6;
      });
      const pingTime =
        !reduced && progress > 0.35 && progress < 0.55
          ? (progress - 0.35) / 0.2
          : -1;
      ping.visible = pingTime >= 0;
      ping.position.copy(curve.getPointAt(0.4));
      ping.scale.setScalar(1 + Math.max(0, pingTime) * 2.5);
      ping.material.opacity =
        pingTime >= 0 ? Math.sin(Math.PI * pingTime) ** 2 * 0.4 : 0;
      for (let i = 0; i <= 80; i++) {
        const p = curve.getPointAt(Math.max(0, t - ((80 - i) / 80) * 0.2));
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trace.visible = !reduced;
      trace.material.opacity = Math.sin(Math.PI * progress) ** 2 * 0.8;
      key.position.x = -4 + wave * 7;
      rim.intensity = 2 + hop * 2;
      renderer.render(scene, camera);
      floating.style.transform =
        "translate(" +
        -wave * 6 +
        "px," +
        (-wave * 14 - smoothedY * 11 + hit * 3 + idle * 3) +
        "px) rotate(" +
        (-5 + smoothedX * 4 + hit * 2) +
        "deg)";
    }
    function resize() {
      const rect = mount.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    let paletteLight = false;
    const update = (event: Event) => {
      const frame = (event as CustomEvent<HeroFrame>).detail;
      progress = frame.p;
      time = frame.time;
      route = frame.route;
      reduced = frame.reduced;
      if (paletteLight !== frame.light) {
        paletteLight = frame.light;
        edge.material.color.set(frame.light ? "#4c5c55" : "#eaf0d4");
        trace.material.color.set(frame.light ? "#64751a" : "#dfea8a");
        ping.material.color.set(frame.light ? "#8a9a32" : "#e5ef9e");
      }
      render();
    };
    root.addEventListener("tg-frame", update);
    const pointerMove = (e: PointerEvent) => {
      if (reduced) return;
      const b = host.getBoundingClientRect();
      pointerX = (e.clientX - b.left) / b.width - 0.5;
      pointerY = (e.clientY - b.top) / b.height - 0.5;
    };
    const pointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    host.addEventListener("pointermove", pointerMove);
    host.addEventListener("pointerleave", pointerLeave);
    host.classList.add("tg-three-ready");
    resize();
    return () => {
      observer.disconnect();
      root.removeEventListener("tg-frame", update);
      host.removeEventListener("pointermove", pointerMove);
      host.removeEventListener("pointerleave", pointerLeave);
      scene.traverse((object) => {
        if (
          object instanceof T.Mesh ||
          object instanceof T.Line ||
          object instanceof T.Sprite
        ) {
          if ("geometry" in object) object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      studio.traverse((object) => {
        if (object instanceof T.Mesh) {
          object.geometry.dispose();
          (object.material as Three.Material).dispose();
        }
      });
      glowTexture.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.remove();
      floating.remove();
      host.classList.remove("tg-three-ready");
    };
  } catch (error) {
    console.warn(
      "Monolith artwork unavailable; static brand mark retained.",
      error,
    );
    return () => {};
  }
}
