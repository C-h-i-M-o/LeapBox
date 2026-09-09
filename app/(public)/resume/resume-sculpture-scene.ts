import {
  AdditiveBlending, BufferAttribute, BufferGeometry, OrthographicCamera,
  Points, Scene, ShaderMaterial, SRGBColorSpace, StreamDrawUsage, Vector2, WebGLRenderer,
} from "three";
import { resumeLoadingEvents } from "./resume-loading.ts";
import { createStarTexture } from "./resume-star-texture.ts";
import { advanceStarFlow } from "./resume-star-flow.ts";
import { advanceStarPaths, createStarColors, createStarPaths, type StarShape } from "./resume-star-models.ts";
import { starFragmentShader, starVertexShader } from "./resume-star-shaders.ts";
import { smoothHeroTurn, getHeroIntro, getHeroDragWeight, getHeroScatter, getHeroTurn, getTransitionGather, returnStarRotation, smoothStarProgress } from "./resume-star-motion.ts";

const chapterShapes: readonly StarShape[] = ["spiral", "weave", "ring"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** 全页共用一组星点；章节形状变化不重建 WebGL 上下文。 */
export function mountResumeSculpture(host: HTMLElement): () => void {
  const root = host.closest<HTMLElement>(".resume-page");
  if (!root) return () => undefined;
  const canvas = document.createElement("canvas");
  canvas.dataset.sculptureCanvas = "true";
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  } catch {
    root.dataset.starfieldUnavailable = "true";
    return () => undefined;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 760px)");
  const count = mobile.matches ? 1400 : 3000;
  const paths = chapterShapes.map((shape) => createStarPaths(shape, count));
  const shapes = paths.map((path) => path.positions);
  const geometry = new BufferGeometry();
  const source = new Float32Array(shapes[0]);
  const target = new Float32Array(shapes[0]);
  const seeds = new Float32Array(count);
  const scatter = new Float32Array(count * 3);
  const entrance = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const seed = (i * .61803398875) % 1;
    seeds[i] = seed;
    entrance.set([((i * .754877666) % 1) * 2 - 1, ((i * .56984029) % 1) * 2 - 1, seed * 2 - 1], i * 3);
    scatter[i * 3] = (i % 2 ? 1 : -1) * (.53 + ((i * .754877666) % 1) * .48);
    scatter[i * 3 + 1] = ((i * .56984029) % 1) * 2.1 - 1.05;
    scatter[i * 3 + 2] = seed * 2 - 1;
  }
  const sourceAttribute = new BufferAttribute(source, 3);
  const targetAttribute = new BufferAttribute(target, 3).setUsage(StreamDrawUsage);
  geometry.setAttribute("position", sourceAttribute);
  geometry.setAttribute("aTarget", targetAttribute);
  geometry.setAttribute("aScatter", new BufferAttribute(scatter, 3));
  geometry.setAttribute("aEntrance", new BufferAttribute(entrance, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  geometry.setAttribute("color", new BufferAttribute(createStarColors(count), 3));
  const offsets = new Float32Array(count * 2);
  const velocities = new Float32Array(count * 2);
  const displacement = new BufferAttribute(offsets, 2).setUsage(StreamDrawUsage);
  geometry.setAttribute("aDisplacement", displacement);
  const sprite = createStarTexture();
  const uniforms = {
    uSprite: { value: sprite },
    uMorph: { value: 1 }, uScatter: { value: 1 }, uAspect: { value: 1 },
    uScale: { value: .5 }, uTime: { value: 0 }, uPixelRatio: { value: 1 },
    uFocus: { value: 1 }, uCenter: { value: new Vector2(.5, 0) },
    uRotation: { value: new Vector2(.2, 1.05) },
    uRoll: { value: 0 },
    uTurn: { value: 0 },
    uGlow: { value: 1 },
    uPerspective: { value: .22 },
    uIntro: { value: 1 },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: starVertexShader, fragmentShader: starFragmentShader,
    vertexColors: true, transparent: true, blending: AdditiveBlending,
    depthWrite: false, depthTest: false,
  });
  const scene = new Scene();
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 10);
  camera.position.z = 3;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(canvas);
  const hero = root.querySelector<HTMLElement>("#top");
  const contact = root.querySelector<HTMLElement>("#contact");
  const anchor = root.querySelector<HTMLElement>("[data-star-anchor]");
  const contactAnchor = root.querySelector<HTMLElement>("[data-contact-star-anchor]");
  const transitions = Array.from(root.querySelectorAll<HTMLElement>("[data-star-transition]"));
  const bounds = new Map<HTMLElement, { top: number; left: number; width: number; height: number }>();
  const measuredElements = [hero, contact, anchor, contactAnchor, ...transitions].filter((element): element is HTMLElement => element !== null);
  let layoutNeeded = true;
  const refreshBounds = () => {
    const scrollY = window.scrollY;
    for (const element of measuredElements) {
      const rect = element.getBoundingClientRect();
      bounds.set(element, { top: rect.top + scrollY, left: rect.left, width: rect.width, height: rect.height });
    }
    layoutNeeded = false;
  };
  const viewportBounds = (element: HTMLElement) => {
    const rect = bounds.get(element)!;
    const top = rect.top - window.scrollY;
    return { ...rect, top, bottom: top + rect.height };
  };
  let active = 0;
  let frame = 0;
  let last = 0;
  let phase = 0;
  let introElapsed = 0;
  let introComplete = false;
  let disposed = false;
  let lost = false;
  let measureNeeded = true;
  let spread = 1;
  let heroTurn = 0;
  let currentTurn = 0;
  let mode: "featured" | "transition" | "background" = "featured";
  let pointerActive = false;
  let flowEnergy = 0;
  const pointerTarget = new Vector2();
  const pointerPosition = new Vector2();
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let rotationX = .2;
  let rotationY = 1.05;
  let releasedX = .2;
  let releasedY = 1.05;
  let releasedAt = 0;
  const center = new Vector2();
  let scale = .5;
  let lastDiagnostics = 0;
  let sampledFrames = 0;
  let sampledSeconds = 0;
  let slowSamples = 0;
  const profiling = new URLSearchParams(window.location.search).has("profile");
  const frameSamples: number[] = [];
  const switchShape = (next: number) => {
    if (next === active) return;
    // 中途反向滚动时从当前插值姿态续接，避免瞬间跳回前一模型。
    const t = uniforms.uMorph.value;
    const ease = t * t * (3 - 2 * t);
    for (let i = 0; i < source.length; i++) source[i] += (target[i] - source[i]) * ease;
    target.set(shapes[next]);
    sourceAttribute.needsUpdate = true;
    targetAttribute.needsUpdate = true;
    // 背景阶段直接准备下一形状，进入视口后无需刻意等待重建。
    if (uniforms.uScatter.value > .95) source.set(shapes[next]);
    uniforms.uMorph.value = uniforms.uScatter.value > .95 ? 1 : 0;
    active = next;
    host.dataset.shape = chapterShapes[next];
  };
  const measure = () => {
    if (layoutNeeded) refreshBounds();
    const height = window.innerHeight;
    const aspect = uniforms.uAspect.value;
    spread = 1;
    heroTurn = 0;
    mode = "background";
    const placeAnchor = (element: HTMLElement) => {
      const rect = viewportBounds(element);
      center.set((rect.left + rect.width / 2) / height * 2 - aspect, 1 - (rect.top + rect.height / 2) / height * 2);
      scale = Math.min(rect.width, rect.height) / height * .84;
    };
    if (hero && anchor && viewportBounds(hero).bottom > height * .35) {
      switchShape(0);
      const rect = viewportBounds(hero);
      spread = getHeroScatter(rect.top, height);
      heroTurn = getHeroTurn(rect.top, height);
      mode = "featured";
      placeAnchor(anchor);
      // 新书写星带横向更舒展，留出旋转边缘，避免超出首屏。
      scale *= .8;
      // 转向展示期间减缓上移，让完整旋臂在第四段散开前仍留在视口。
      center.y += Math.min(0, rect.top) / height * 1.4;
    }
    // 过渡舞台独占空间，正文进入视口前已经完全散开。
    for (const element of transitions) {
      const rect = viewportBounds(element);
      if (rect.height < 1 || rect.top >= height * 1.35 || rect.bottom <= 0) continue;
      if (rect.top >= height) { switchShape(1); continue; }
      const gather = getTransitionGather((height - rect.top) / (height + rect.height));
      if (gather <= .001) continue;
      const next = chapterShapes.findIndex((shape) => shape === element.dataset.starTransition);
      if (next < 0) continue;
      switchShape(next);
      spread = 1 - gather;
      mode = "transition";
      center.set(0, 1 - (rect.top + rect.height / 2) / height * 2);
      scale = Math.min(.70, aspect * .74);
    }
    if (contact && contactAnchor && viewportBounds(contact).top < height * 1.35) {
      switchShape(chapterShapes.length - 1);
      spread = 1 - smoothStarProgress(-.35, .15, 1 - viewportBounds(contact).top / height);
      mode = "featured";
      placeAnchor(contactAnchor);
    }
    measureNeeded = false;
  };
  const canRender = () => !disposed && !lost && !document.hidden && root.dataset.loadingState === "ready";
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const draw = (time: number) => {
    frame = 0;
    if (!canRender()) return;
    const dt = last ? Math.min(.08, (time - last) / 1000) : 1 / 40;
    if (last) {
      sampledFrames++;
      sampledSeconds += (time - last) / 1000;
      if (profiling) { frameSamples.push(time - last); if (frameSamples.length > 600) frameSamples.shift(); }
    }
    if (sampledSeconds >= 1) {
      const fps = sampledFrames / sampledSeconds;
      host.dataset.fps = fps.toFixed(0);
      if (profiling) {
        const sorted = [...frameSamples].sort((a, b) => a - b);
        host.dataset.p95 = (sorted[Math.floor((sorted.length - 1) * .95)] ?? 0).toFixed(1);
        host.dataset.longFrames = String(sorted.filter((duration) => duration > 33.4).length);
        host.dataset.frameCount = String(sorted.length);
      }
      // 连续低帧率时只降低画布分辨率，保持文字清晰和完整模型。
      slowSamples = fps < 48 && !reduced.matches ? slowSamples + 1 : 0;
      if (slowSamples >= 2 && renderer.getPixelRatio() > .8) {
        const ratio = Math.max(.8, renderer.getPixelRatio() - .2);
        renderer.setPixelRatio(ratio);
        uniforms.uPixelRatio.value = ratio;
        slowSamples = 0;
      }
      sampledFrames = 0;
      sampledSeconds = 0;
    }
    last = time;
    if (measureNeeded) measure();
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 9);
    if (!introComplete) {
      introElapsed += dt;
      introComplete = reduced.matches || window.scrollY > window.innerHeight * .05 || active !== 0 || introElapsed >= 2;
    }
    uniforms.uIntro.value = introComplete ? 0 : getHeroIntro(introElapsed);
    uniforms.uScatter.value += (spread - uniforms.uScatter.value) * ease;
    if (Math.abs(spread - uniforms.uScatter.value) < .001) uniforms.uScatter.value = spread;
    uniforms.uFocus.value = 1 - uniforms.uScatter.value;
    uniforms.uGlow.value = 1 + (active === 0 ? .65 : 0) * uniforms.uFocus.value;
    uniforms.uCenter.value.lerp(center, ease);
    uniforms.uScale.value += (scale - uniforms.uScale.value) * ease;
    uniforms.uMorph.value = reduced.matches ? 1 : Math.min(1, uniforms.uMorph.value + dt * .8);
    if (!dragging) {
      // 使用松手后的实际时间，低帧率或标签页暂停不延长复位。
      const elapsed = (time - releasedAt) / 1000;
      rotationX = returnStarRotation(releasedX, .2, elapsed);
      rotationY = returnStarRotation(releasedY, 1.05, elapsed);
    }
    phase += reduced.matches ? 0 : dt;
    uniforms.uTime.value = phase;
    // 保持模型正面，星点沿预计算的闭合路径循环；拖动只改变观察角度。
    // 完全散开时只渲染背景；重新聚合当帧按当前时间恢复模型。
    if (uniforms.uScatter.value < 1 || !introComplete) {
      advanceStarPaths(target, paths[active], phase);
      targetAttribute.needsUpdate = true;
    }
    // 保留确认的空间角度，只平滑短时变化，并精确吸附最终角度。
    currentTurn = reduced.matches ? 0 : smoothHeroTurn(currentTurn, active !== 0 ? 0 : heroTurn, dt);
    // 信封仅叠加固定观察角度，模型数据不变，松手后仍回到此姿态。
    const envelope = active === 2;
    const dragWeight = active === 0 ? getHeroDragWeight(currentTurn) : 1;
    const modelRotationX = .2 + (rotationX - .2) * dragWeight + (envelope ? .18 : 0);
    const modelRotationY = 1.05 + (rotationY - 1.05) * dragWeight - (envelope ? .1 : 0);
    // 绕屏幕水平轴向内倾转，第三段到达仰视，只改变观察角度。
    uniforms.uTurn.value = currentTurn;
    uniforms.uPerspective.value = active === 0 ? .22 * (1 - smoothStarProgress(0, Math.PI / 2, currentTurn)) : .22;
    uniforms.uRoll.value = envelope ? .4 : 0;
    uniforms.uRotation.value.set(modelRotationX, modelRotationY);
    if (reduced.matches && flowEnergy > 0) {
      offsets.fill(0); velocities.fill(0); flowEnergy = 0; displacement.needsUpdate = true;
    } else if (!reduced.matches && ((pointerActive && introComplete && pointerPosition.distanceToSquared(pointerTarget) > 1e-8) || flowEnergy > .001)) {
      const previousX = pointerPosition.x, previousY = pointerPosition.y;
      pointerPosition.lerp(pointerTarget, 1 - Math.exp(-dt * 20));
      flowEnergy = advanceStarFlow(offsets, velocities, source, target, scatter, seeds, {
        morph: uniforms.uMorph.value, scatter: uniforms.uScatter.value,
        scale: uniforms.uScale.value, aspect: uniforms.uAspect.value,
        centerX: uniforms.uCenter.value.x, centerY: uniforms.uCenter.value.y,
        perspective: uniforms.uPerspective.value,
        rotationX: modelRotationX, rotationY: modelRotationY, roll: uniforms.uRoll.value, turn: uniforms.uTurn.value,
      }, {
        x: pointerPosition.x, y: pointerPosition.y,
        dx: pointerPosition.x - previousX, dy: pointerPosition.y - previousY,
        active: pointerActive && !dragging && introComplete,
      }, dt);
      displacement.needsUpdate = true;
    }
    if (time - lastDiagnostics > 250) {
      host.dataset.state = mode;
      host.dataset.scatter = uniforms.uScatter.value.toFixed(3);
      host.dataset.rotation = rotationX.toFixed(3);
      host.dataset.intro = uniforms.uIntro.value.toFixed(3);
      host.dataset.turnDegrees = (uniforms.uTurn.value * 180 / Math.PI).toFixed(2);
      lastDiagnostics = time;
    }
    try {
      renderer.render(scene, camera);
      if (host.dataset.renderer !== "webgl") host.dataset.renderer = "webgl";
    } catch {
      lost = true;
      delete host.dataset.renderer;
    }
    if (!reduced.matches && !lost) frame = requestAnimationFrame(draw);
  };
  const sync = () => {
    if (!canRender()) stop();
    else if (!frame) frame = requestAnimationFrame(draw);
  };
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.uPixelRatio.value = ratio;
    uniforms.uAspect.value = window.innerWidth / window.innerHeight;
    measureNeeded = true;
    layoutNeeded = true;
    sync();
  };
  const scroll = () => {
    measureNeeded = true;
    sync();
  };
  const pointer = (event: PointerEvent) => {
    if (event.pointerType === "touch" || reduced.matches) return;
    const x = event.clientX / window.innerHeight * 2 - uniforms.uAspect.value;
    const y = 1 - event.clientY / window.innerHeight * 2;
    pointerTarget.set(x, y);
    if (!pointerActive) pointerPosition.copy(pointerTarget);
    pointerActive = true;
    if (dragging) {
      rotationX += (event.clientX - dragX) * .006;
      rotationY = clamp(rotationY + (event.clientY - dragY) * .006, -1.3, 1.3);
      host.dataset.rotation = rotationX.toFixed(2);
      dragX = event.clientX;
      dragY = event.clientY;
    }
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch" || reduced.matches) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element || element.closest("a, button, input, textarea, p, h1, h2, h3, li, figure")) return;
    const edge = event.clientX < window.innerWidth * .1 || event.clientX > window.innerWidth * .9;
    if (!edge && !element.closest("[data-star-anchor], [data-contact-star-anchor], [data-star-transition]")) return;
    if (mode === "background") return;
    dragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    root.dataset.starDragging = "true";
    event.preventDefault();
  };
  const up = () => {
    if (dragging) {
      releasedX = rotationX;
      releasedY = rotationY;
      releasedAt = performance.now();
    }
    dragging = false;
    delete root.dataset.starDragging;
  };
  const leave = () => { pointerActive = false; up(); };
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    stop();
    delete host.dataset.renderer;
  };
  const onRestored = () => { lost = false; measureNeeded = true; sync(); };
  const layout = new ResizeObserver(() => { layoutNeeded = true; measureNeeded = true; sync(); });
  layout.observe(root);
  if (anchor) layout.observe(anchor);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", scroll, { passive: true });
  root.addEventListener("pointermove", pointer, { passive: true });
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointerleave", leave);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", leave);
  window.addEventListener("blur", leave);
  document.addEventListener("visibilitychange", sync);
  root.addEventListener(resumeLoadingEvents.reveal, resize);
  reduced.addEventListener("change", resize);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  host.dataset.shape = chapterShapes[0];
  resize();
  return () => {
    disposed = true;
    stop();
    up();
    layout.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", scroll);
    root.removeEventListener("pointermove", pointer);
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("pointerleave", leave);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", leave);
    window.removeEventListener("blur", leave);
    document.removeEventListener("visibilitychange", sync);
    root.removeEventListener(resumeLoadingEvents.reveal, resize);
    reduced.removeEventListener("change", resize);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    geometry.dispose();
    material.dispose();
    sprite.dispose();
    renderer.dispose();
    canvas.remove();
    delete host.dataset.renderer;
  };
}
