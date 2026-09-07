import {
  ACESFilmicToneMapping, DirectionalLight, ExtrudeGeometry, Group,
  HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera,
  PMREMGenerator, Scene, Shape, SRGBColorSpace, WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { resumeLoadingEvents } from "./resume-loading.ts";

const outlinePolygons: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[21, 22], [36, 22], [61, 49], [53, 58]],
  [[91, 22], [107, 22], [65, 65], [65, 90], [105, 90], [93, 102], [54, 102], [54, 61]],
];

/** 两段轮廓共用坐标原点，避免单独居中后破坏 Y/L 形状。 */
function createShape(points: ReadonlyArray<readonly [number, number]>): Shape {
  const shape = new Shape();
  points.forEach(([x, y], index) => {
    const px = (x - 64) / 45;
    const py = (62 - y) / 45;
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
}

/** 该模块由组件在挂载后动态导入，不在服务端创建 WebGL 对象。 */
export function mountResumeSculpture(host: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.dataset.sculptureCanvas = "true";
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return () => undefined;
  }
  const geometries: ExtrudeGeometry[] = [];
  const material = new MeshStandardMaterial({ color: 0x80b8a1, metalness: 0.92, roughness: 0.26 });
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  let environmentTarget: WebGLRenderTarget | undefined;
  const disposeResources = () => {
    geometries.forEach((geometry) => geometry.dispose());
    material.dispose();
    environmentTarget?.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
    delete host.dataset.renderer;
  };
  const group = new Group();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 4.9);
  try {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const environment = new RoomEnvironment();
    try {
      environmentTarget = pmrem.fromScene(environment, 0.04);
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = 1.2;
    } finally {
      environment.dispose();
    }
    for (const points of outlinePolygons) {
      const geometry = new ExtrudeGeometry(createShape(points), {
        depth: 0.23, bevelEnabled: true, bevelSegments: 4,
        bevelSize: 0.028, bevelThickness: 0.04, curveSegments: 1,
      });
      geometry.translate(0, 0, -0.115);
      geometries.push(geometry);
      group.add(new Mesh(geometry, material));
    }
    const key = new DirectionalLight(0xe9fff5, 3);
    key.position.set(-3, 4, 5);
    const fill = new DirectionalLight(0x64bf9b, 1.6);
    fill.position.set(4, -1, 3);
    const rim = new DirectionalLight(0xaaffdc, 3);
    rim.position.set(0, 2, -4);
    scene.add(group, key, fill, rim, new HemisphereLight(0xd7eee4, 0x10251c, 0.7));
    host.appendChild(canvas);
  } catch {
    disposeResources();
    return () => undefined;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const root = host.closest<HTMLElement>(".resume-page");
  let disposed = false;
  let visible = false;
  let lost = false;
  let frame = 0;
  let last = 0;
  let phase = 0;
  let pointerX = 0;
  let pointerY = 0;
  const canRender = () => !disposed && !lost && visible && !document.hidden && root?.dataset.loadingState === "ready";
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const draw = (time: number) => {
    frame = 0;
    if (!canRender()) return;
    if (last && time - last < 32 && !reduced.matches) { frame = requestAnimationFrame(draw); return; }
    const dt = last ? Math.min(0.06, (time - last) / 1000) : 1 / 30;
    last = time;
    phase += reduced.matches ? 0 : dt;
    const x = reduced.matches ? -0.12 : -0.12 - pointerY * 0.15 + Math.sin(phase * 0.55) * 0.035;
    const y = reduced.matches ? -0.32 : -0.32 + pointerX * 0.42 + Math.sin(phase * 0.36) * 0.07;
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 5);
    group.rotation.x += (x - group.rotation.x) * ease;
    group.rotation.y += (y - group.rotation.y) * ease;
    group.rotation.z = -0.055;
    group.position.y = reduced.matches ? 0 : Math.sin(phase * 0.85) * 0.035;
    try {
      renderer.render(scene, camera);
      host.dataset.renderer = "webgl";
    } catch {
      lost = true;
      delete host.dataset.renderer;
      return;
    }
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  };
  const sync = () => {
    if (!canRender()) stop();
    else if (!frame) frame = requestAnimationFrame(draw);
  };
  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    sync();
  };
  const pointer = (event: PointerEvent) => {
    if (reduced.matches || !fine.matches || event.pointerType === "touch") return;
    const rect = host.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
  };
  const leave = () => { pointerX = 0; pointerY = 0; };
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    stop();
    delete host.dataset.renderer;
  };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  const sizeObserver = new ResizeObserver(resize);
  observer.observe(host);
  sizeObserver.observe(host);
  canvas.addEventListener("webglcontextlost", onLost);
  host.addEventListener("pointermove", pointer, { passive: true });
  host.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", sync);
  root?.addEventListener(resumeLoadingEvents.reveal, sync);
  reduced.addEventListener("change", sync);
  resize();
  return () => {
    disposed = true;
    stop();
    observer.disconnect();
    sizeObserver.disconnect();
    canvas.removeEventListener("webglcontextlost", onLost);
    host.removeEventListener("pointermove", pointer);
    host.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", sync);
    root?.removeEventListener(resumeLoadingEvents.reveal, sync);
    reduced.removeEventListener("change", sync);
    disposeResources();
  };
}
