"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TruckSize } from "@/lib/truck";

export interface Box3 {
  id: string;
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  color: string;
  /** over the ceiling */
  bad: boolean;
  sel: boolean;
}

// three.js works in feet here: x along the truck, y up, z across
const FT = 1 / 12;

/** The truck and its load in 3D. Drag or hold the mouse wheel to orbit, scroll to zoom, right-drag to pan. */
export function Truck3D({ truck, boxes, hint, reset }: { truck: TruckSize; boxes: Box3[]; hint: string; reset: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ load: (b: Box3[]) => void; frame: (t: TruckSize) => void } | null>(null);

  // scene, camera and controls, once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-20, 40, 25);
    scene.add(sun);

    const shell = new THREE.Group();
    const load = new THREE.Group();
    scene.add(shell, load);

    const disposeGroup = (g: THREE.Group) => {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      g.clear();
    };

    const frame = (t: TruckSize) => {
      disposeGroup(shell);
      const L = t.l * FT;
      const W = t.w * FT;
      const H = t.h * FT;
      const ink = getComputedStyle(el).getPropertyValue("--muted").trim() || "#888888";
      // floor with a line every foot, and the outline of the box
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ color: 0x8a8a92, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(L / 2, 0, W / 2);
      shell.add(floor);
      const pts: number[] = [];
      for (let x = 1; x < L; x++) pts.push(x, 0.001, 0, x, 0.001, W);
      const grid = new THREE.BufferGeometry();
      grid.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      shell.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.35 })));
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: ink }));
      outline.position.set(L / 2, H / 2, W / 2);
      shell.add(outline);
      // the front wall, solid, so you can tell front from doors
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: 0x8a8a92, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      wall.rotation.y = Math.PI / 2;
      wall.position.set(0, H / 2, W / 2);
      shell.add(wall);

      // look in from the doors, a little above
      camera.position.set(L * 0.92, H * 1.5 + L * 0.18, W * 1.5 + L * 0.32);
      controls.target.set(L * 0.45, H * 0.3, W / 2);
      controls.update();
    };

    const loadBoxes = (bs: Box3[]) => {
      disposeGroup(load);
      for (const b of bs) {
        const geo = new THREE.BoxGeometry(b.l * FT, b.h * FT, b.w * FT);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.bad ? 0xff3b3b : b.color, roughness: 0.75 }));
        mesh.position.set((b.x + b.l / 2) * FT, (b.z + b.h / 2) * FT, (b.y + b.w / 2) * FT);
        load.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: b.sel ? 0xffffff : 0x0b0b0c }));
        edges.position.copy(mesh.position);
        load.add(edges);
      }
    };

    const size = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    api.current = { load: loadBoxes, frame };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeGroup(shell);
      disposeGroup(load);
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // reframe when the truck changes size; reload the cases whenever the plan changes
  useEffect(() => api.current?.frame(truck), [truck]);
  useEffect(() => api.current?.load(boxes), [boxes]);

  return (
    <div className="truck-3d">
      <div ref={host} className="truck-3d-canvas" onContextMenu={(e) => e.preventDefault()} />
      <div className="truck-3d-bar">
        <span className="muted small">{hint}</span>
        <button type="button" className="btn sm" onClick={() => api.current?.frame(truck)}>
          {reset}
        </button>
      </div>
    </div>
  );
}
