import { useEffect, useRef } from "react";
import * as THREE from "three";

// Subtle, fixed, full-viewport Three.js particle field rendered behind the
// whole app. It is `position: fixed`, `pointer-events: none`, and sits at
// z-index 0, so it never intercepts clicks and never affects layout — the
// rest of the UI (Sidebar, Layout content) just needs `position: relative`
// and a z-index above it, which Layout.jsx already sets.
export default function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.z = 20;

    const particleCount = 140;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const isDark = document.documentElement.dataset.theme === "dark";
    const material = new THREE.PointsMaterial({
      color: isDark ? 0x6ea8fe : 0x0d6efd,
      size: 0.16,
      transparent: true,
      opacity: 0.32,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const resize = () => {
      const { innerWidth, innerHeight } = window;
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // Keep particle tint in sync if the user toggles light/dark theme
    // without remounting this component.
    const themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.dataset.theme === "dark";
      material.color.set(dark ? 0x6ea8fe : 0x0d6efd);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let frameId;
    const animate = () => {
      points.rotation.y += 0.0006;
      points.rotation.x += 0.0002;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      themeObserver.disconnect();
      geometry.dispose();
      material.dispose();
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
