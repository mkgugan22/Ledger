import { useEffect, useRef } from "react";
import * as THREE from "three";

// Ambient Three.js "constellation" backdrop for the Login screen — brass
// motes drifting over the ledger cover, linking into faint gold threads
// when they drift close together, with a soft cursor-driven parallax.
// Inspired by the particle-network hero treatments common on Awwwards'
// Three.js showcase (https://www.awwwards.com/websites/three-js/), but
// built from scratch with the `three` version already in this project's
// package.json — no template purchase, no new dependency, no license risk.
//
// Scoped and inert by design:
//   - `position: absolute` inside its own positioned parent (.lg-auth-shell),
//     so it can never bleed into the dashboard/sidebar layout elsewhere.
//   - `pointer-events: none` + `aria-hidden`, so it never intercepts clicks
//     or taps meant for the login form sitting above it.
//   - Sized to its container (ResizeObserver), not the window — it cannot
//     grow past the login screen.
//   - Fully torn down on unmount (geometry/material/renderer disposed,
//     listeners removed) so navigating to/from /login never leaks memory.
export default function LedgerHeroBackground() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 26;

    // Motes: a small brass-toned point field, dense enough to feel alive
    // without weighing down a login screen.
    const MOTE_COUNT = 90;
    const LINK_DISTANCE = 6.2;
    const positions = new Float32Array(MOTE_COUNT * 3);
    const drift = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      drift[i * 3] = (Math.random() - 0.5) * 0.006;
      drift[i * 3 + 1] = (Math.random() - 0.5) * 0.006;
      drift[i * 3 + 2] = (Math.random() - 0.5) * 0.004;
    }

    const isDark = () => document.documentElement.dataset.theme === "dark";
    const moteColor = () => (isDark() ? 0xd1b15a : 0xb8912f);
    const lineColor = () => (isDark() ? 0xd1b15a : 0x8e6e1f);

    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const moteMaterial = new THREE.PointsMaterial({
      color: moteColor(),
      size: 0.22,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
    });
    const motes = new THREE.Points(moteGeometry, moteMaterial);
    scene.add(motes);

    // Threads: a LineSegments buffer sized for the worst case (every mote
    // linked to every other), rewritten each frame with only the pairs
    // currently within LINK_DISTANCE. This is the standard technique
    // behind the "particle network" look on constellation-style hero
    // backgrounds, kept cheap here by the small mote count.
    const maxPairs = (MOTE_COUNT * (MOTE_COUNT - 1)) / 2;
    const linePositions = new Float32Array(maxPairs * 2 * 3);
    const lineGeometry = new THREE.BufferGeometry();
    const linePositionAttr = new THREE.BufferAttribute(linePositions, 3);
    linePositionAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setAttribute("position", linePositionAttr);
    lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: lineColor(),
      transparent: true,
      opacity: 0.16,
    });
    const threads = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(threads);

    const group = new THREE.Group();
    group.add(motes);
    group.add(threads);
    scene.remove(motes);
    scene.remove(threads);
    scene.add(group);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Gentle parallax: the field tilts a couple of degrees toward the
    // cursor, never enough to distract from the login form.
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    const themeObserver = new MutationObserver(() => {
      moteMaterial.color.set(moteColor());
      lineMaterial.color.set(lineColor());
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let frameId;
    const renderLinks = () => {
      let vertexIndex = 0;
      for (let i = 0; i < MOTE_COUNT; i++) {
        for (let j = i + 1; j < MOTE_COUNT; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < LINK_DISTANCE) {
            linePositions[vertexIndex++] = positions[i * 3];
            linePositions[vertexIndex++] = positions[i * 3 + 1];
            linePositions[vertexIndex++] = positions[i * 3 + 2];
            linePositions[vertexIndex++] = positions[j * 3];
            linePositions[vertexIndex++] = positions[j * 3 + 1];
            linePositions[vertexIndex++] = positions[j * 3 + 2];
          }
        }
      }
      lineGeometry.setDrawRange(0, vertexIndex / 3);
      linePositionAttr.needsUpdate = true;
    };

    const animate = () => {
      for (let i = 0; i < MOTE_COUNT; i++) {
        positions[i * 3] += drift[i * 3];
        positions[i * 3 + 1] += drift[i * 3 + 1];
        positions[i * 3 + 2] += drift[i * 3 + 2];
        // Wrap softly within the field bounds rather than escaping it.
        if (Math.abs(positions[i * 3]) > 17) drift[i * 3] *= -1;
        if (Math.abs(positions[i * 3 + 1]) > 11) drift[i * 3 + 1] *= -1;
        if (Math.abs(positions[i * 3 + 2]) > 7) drift[i * 3 + 2] *= -1;
      }
      moteGeometry.attributes.position.needsUpdate = true;
      renderLinks();

      group.rotation.y += (pointer.x * 0.12 - group.rotation.y) * 0.03;
      group.rotation.x += (-pointer.y * 0.08 - group.rotation.x) * 0.03;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    if (prefersReducedMotion) {
      // Respect the user's motion preference: render a single static frame.
      renderLinks();
      renderer.render(scene, camera);
    } else {
      animate();
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      moteGeometry.dispose();
      moteMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
