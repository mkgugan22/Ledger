import { useEffect, useRef } from "react";
import * as THREE from "three";

// -----------------------------------------------------------------------
// AnimatedBackground
// -----------------------------------------------------------------------
// A single, subtle, full-viewport Three.js scene rendered behind the whole
// app. It is mounted once in Layout.jsx, so it automatically shows up
// behind EVERY sidebar page (Dashboard, Add Entry, All Entries, Budget,
// Savings Tracker, SIP Growth) without any per-page wiring.
//
// Visual concept (inspired by the soft, glowing WebGL particle/constellation
// backgrounds seen in Awwwards' Three.js showcase): a field of glowing
// "brass ink dot" points that drift in a gentle ledger-page wave, with the
// nearest points joined by faint threads that fade in/out as they drift —
// like a hand-drawn ledger network — plus a very light parallax tilt that
// follows the pointer for depth.
//
// Safety / non-interference contract (unchanged from the previous version):
//   - position: fixed, inset: 0, so it never participates in page layout
//   - pointer-events: none, so it can never intercept clicks/taps
//   - z-index: 0, sitting behind Sidebar/TopNavbar/main content (zIndex: 1)
//   - no props, no state, no data — purely decorative, touches nothing in
//     App.jsx / api.js / any page component
//   - respects prefers-reduced-motion (renders a static frame, no RAF loop)
//   - pauses the render loop when the tab is hidden (battery/perf friendly)
//   - wrapped so a WebGL failure (old GPU, disabled WebGL, etc.) never
//     throws and never blocks the rest of the app from rendering
export default function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      // No WebGL available — fail silently, the rest of the UI is unaffected.
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.z = 22;

    const group = new THREE.Group();
    scene.add(group);

    // ---- Soft glowing dot sprite (canvas-generated radial gradient) ----
    const dotTexture = (() => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,0.55)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    })();

    // ---- Particle field ----
    const COUNT = prefersReducedMotion ? 70 : 130;
    const basePositions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      basePositions[i * 3] = (Math.random() - 0.5) * 46;
      basePositions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      basePositions[i * 3 + 2] = (Math.random() - 0.5) * 22;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const livePositions = Float32Array.from(basePositions);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(livePositions, 3));

    const isDarkNow = () => document.documentElement.dataset.theme === "dark";
    const PALETTE = {
      light: { dot: new THREE.Color(0xb8912f), line: new THREE.Color(0x8e6e1f) },
      dark: { dot: new THREE.Color(0xe7bd86), line: new THREE.Color(0x6ea8fe) },
    };
    const currentDotColor = new THREE.Color().copy(isDarkNow() ? PALETTE.dark.dot : PALETTE.light.dot);
    const currentLineColor = new THREE.Color().copy(isDarkNow() ? PALETTE.dark.line : PALETTE.light.line);

    const material = new THREE.PointsMaterial({
      map: dotTexture,
      color: currentDotColor,
      size: 0.85,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    group.add(points);

    // ---- Constellation threads between nearby particles ----
    const MAX_LINK_DIST = 6.4;
    const MAX_SEGMENTS = COUNT * 4; // safety cap on how many line segments we ever allocate
    const linePositions = new Float32Array(MAX_SEGMENTS * 2 * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: currentLineColor,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    group.add(lines);

    const rebuildLinks = () => {
      let segCount = 0;
      for (let i = 0; i < COUNT && segCount < MAX_SEGMENTS; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        for (let j = i + 1; j < COUNT && segCount < MAX_SEGMENTS; j++) {
          const jx = j * 3, jy = j * 3 + 1, jz = j * 3 + 2;
          const dx = livePositions[ix] - livePositions[jx];
          const dy = livePositions[iy] - livePositions[jy];
          const dz = livePositions[iz] - livePositions[jz];
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < MAX_LINK_DIST * MAX_LINK_DIST) {
            const base = segCount * 6;
            linePositions[base] = livePositions[ix];
            linePositions[base + 1] = livePositions[iy];
            linePositions[base + 2] = livePositions[iz];
            linePositions[base + 3] = livePositions[jx];
            linePositions[base + 4] = livePositions[jy];
            linePositions[base + 5] = livePositions[jz];
            segCount++;
          }
        }
      }
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.setDrawRange(0, segCount * 2);
    };

    // ---- Pointer parallax (very subtle, decorative only — canvas keeps
    // pointer-events:none so it never steals input) ----
    const pointer = { x: 0, y: 0 };
    const targetTilt = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      targetTilt.y = pointer.x * 0.12;
      targetTilt.x = -pointer.y * 0.08;
    };
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    const resize = () => {
      const { innerWidth, innerHeight } = window;
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // Smoothly ease particle/line tint when the theme toggles, instead of
    // snapping instantly.
    const themeTarget = {
      dot: isDarkNow() ? PALETTE.dark.dot : PALETTE.light.dot,
      line: isDarkNow() ? PALETTE.dark.line : PALETTE.light.line,
    };
    const themeObserver = new MutationObserver(() => {
      const target = isDarkNow() ? PALETTE.dark : PALETTE.light;
      themeTarget.dot = target.dot;
      themeTarget.line = target.line;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let frameId;
    let linkFrameCounter = 0;
    const clock = new THREE.Clock();

    const renderFrame = () => {
      const t = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Gentle ledger-page wave: each particle drifts on a sine wave
        // driven by its own phase and x position, plus a slow overall spin.
        for (let i = 0; i < COUNT; i++) {
          const idx = i * 3;
          const px = basePositions[idx];
          const pz = basePositions[idx + 2];
          livePositions[idx] = px + Math.sin(t * 0.12 + phases[i]) * 0.6;
          livePositions[idx + 1] = basePositions[idx + 1] + Math.sin(t * 0.25 + px * 0.15 + phases[i]) * 0.9;
          livePositions[idx + 2] = pz + Math.cos(t * 0.1 + phases[i]) * 0.5;
        }
        geometry.attributes.position.needsUpdate = true;

        // Rebuilding the O(n^2) link list every frame is unnecessary for a
        // background flourish — every 3rd frame keeps it smooth-looking
        // while cutting the CPU cost by two thirds.
        linkFrameCounter = (linkFrameCounter + 1) % 3;
        if (linkFrameCounter === 0) rebuildLinks();

        group.rotation.y += 0.0007;
        group.rotation.x += 0.00018;

        // Ease camera tilt toward pointer target for a soft parallax feel.
        camera.rotation.y += (targetTilt.y - camera.rotation.y) * 0.04;
        camera.rotation.x += (targetTilt.x - camera.rotation.x) * 0.04;
      }

      // Ease colors toward whatever the current theme wants.
      material.color.lerp(themeTarget.dot, 0.05);
      lineMaterial.color.lerp(themeTarget.line, 0.05);

      renderer.render(scene, camera);
      if (!prefersReducedMotion) frameId = requestAnimationFrame(renderFrame);
    };

    if (prefersReducedMotion) {
      // Build one static, fully-linked frame and stop — no animation loop,
      // no listeners driving continuous work, honoring the user's OS setting.
      rebuildLinks();
      renderer.render(scene, camera);
    } else {
      renderFrame();
    }

    // Pause the RAF loop while the tab isn't visible; resume on return.
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = null;
      } else if (!prefersReducedMotion && !frameId) {
        renderFrame();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      themeObserver.disconnect();
      geometry.dispose();
      lineGeometry.dispose();
      material.dispose();
      lineMaterial.dispose();
      dotTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
