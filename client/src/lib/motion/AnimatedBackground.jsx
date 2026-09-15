import { useEffect, useRef } from "react";
import * as THREE from "three";

// Premium ambient background. Decorative only: fixed, pointer-events:none,
// theme-aware, reduced-motion aware, and independent from application state.
export default function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia?.("(max-width: 767px)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !mobile });
    } catch {
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.z = 24;

    const root = new THREE.Group();
    scene.add(root);

    const isDark = () => document.documentElement.dataset.theme === "dark";
    const palette = {
      light: {
        brass: 0xb8912f,
        green: 0x3e6259,
        blue: 0x3f6c82,
        grid: 0x8e6e1f,
      },
      dark: {
        brass: 0xe7bd86,
        green: 0x8fd0b8,
        blue: 0x82c4e4,
        grid: 0x6ea8fe,
      },
    };

    // Soft radial sprites create depth without a large DOM/SVG footprint.
    const makeGlowTexture = () => {
      const size = 128;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,0.72)");
      g.addColorStop(0.22, "rgba(255,255,255,0.28)");
      g.addColorStop(0.58, "rgba(255,255,255,0.07)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    };

    const glowTexture = makeGlowTexture();
    const glowGroup = new THREE.Group();
    root.add(glowGroup);
    const glowSpecs = mobile
      ? [[-9, 7, 7, 0.16], [9, -6, 6, 0.12], [0, 2, 5, 0.08]]
      : [[-11, 7, 10, 0.16], [10, -5, 9, 0.13], [2, 7, 6, 0.09], [-3, -7, 7, 0.07]];
    const glowMaterials = [];
    if (glowTexture) {
      glowSpecs.forEach(([x, y, size, opacity], i) => {
        const mat = new THREE.SpriteMaterial({
          map: glowTexture,
          color: i % 3 === 0 ? palette.light.brass : i % 3 === 1 ? palette.light.green : palette.light.blue,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(x, y, -5 - i);
        sprite.scale.set(size, size, 1);
        glowGroup.add(sprite);
        glowMaterials.push(mat);
      });
    }

    const count = reducedMotion ? (mobile ? 38 : 65) : (mobile ? 58 : 112);
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 43;
      const y = (Math.random() - 0.5) * 28;
      const z = (Math.random() - 0.5) * 17;
      base[i * 3] = positions[i * 3] = x;
      base[i * 3 + 1] = positions[i * 3 + 1] = y;
      base[i * 3 + 2] = positions[i * 3 + 2] = z;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      map: glowTexture || undefined,
      color: palette.light.brass,
      size: mobile ? 0.52 : 0.62,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    root.add(particles);

    // Sparse constellation threads. Rebuilt every fourth frame to reduce CPU work.
    const maxSegments = count * 3;
    const linePositions = new Float32Array(maxSegments * 6);
    const lineGeometry = new THREE.BufferGeometry();
    const lineAttr = new THREE.BufferAttribute(linePositions, 3);
    lineAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setAttribute("position", lineAttr);
    lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: palette.light.grid,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    root.add(lines);

    const rebuildLinks = () => {
      let segments = 0;
      const maxDistSq = 5.7 * 5.7;
      for (let i = 0; i < count && segments < maxSegments; i++) {
        for (let j = i + 1; j < count && segments < maxSegments; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < maxDistSq) {
            const b = segments * 6;
            linePositions[b] = positions[i * 3];
            linePositions[b + 1] = positions[i * 3 + 1];
            linePositions[b + 2] = positions[i * 3 + 2];
            linePositions[b + 3] = positions[j * 3];
            linePositions[b + 4] = positions[j * 3 + 1];
            linePositions[b + 5] = positions[j * 3 + 2];
            segments++;
          }
        }
      }
      lineAttr.needsUpdate = true;
      lineGeometry.setDrawRange(0, segments * 2);
    };

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
      target.y = pointer.x * 0.065;
      target.x = -pointer.y * 0.045;
    };
    if (!reducedMotion && !mobile) window.addEventListener("pointermove", onPointerMove, { passive: true });

    const themeTarget = {
      brass: new THREE.Color(palette.light.brass),
      green: new THREE.Color(palette.light.green),
      blue: new THREE.Color(palette.light.blue),
      grid: new THREE.Color(palette.light.grid),
    };
    const syncTheme = () => {
      const p = isDark() ? palette.dark : palette.light;
      themeTarget.brass.set(p.brass);
      themeTarget.green.set(p.green);
      themeTarget.blue.set(p.blue);
      themeTarget.grid.set(p.grid);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    let frameId = null;
    let lastTime = 0;
    let linkCounter = 0;
    const clock = new THREE.Clock();

    const render = () => {
      const elapsed = clock.getElapsedTime();
      const delta = Math.min(elapsed - lastTime || 0.016, 0.05);
      lastTime = elapsed;

      if (!reducedMotion) {
        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const x = base[idx];
          positions[idx] = x + Math.sin(elapsed * 0.075 + phases[i]) * 0.42;
          positions[idx + 1] = base[idx + 1] + Math.sin(elapsed * 0.17 + x * 0.13 + phases[i]) * 0.62;
          positions[idx + 2] = base[idx + 2] + Math.cos(elapsed * 0.06 + phases[i]) * 0.28;
        }
        particleGeometry.attributes.position.needsUpdate = true;
        linkCounter = (linkCounter + 1) % 4;
        if (linkCounter === 0) rebuildLinks();

        root.rotation.y += (target.y - root.rotation.y) * Math.min(delta * 1.5, 0.06);
        root.rotation.x += (target.x - root.rotation.x) * Math.min(delta * 1.5, 0.06);
        glowGroup.rotation.z += delta * 0.012;
      } else {
        rebuildLinks();
      }

      particleMaterial.color.lerp(themeTarget.brass, 0.035);
      lineMaterial.color.lerp(themeTarget.grid, 0.035);
      if (glowMaterials[0]) glowMaterials[0].color.lerp(themeTarget.brass, 0.035);
      if (glowMaterials[1]) glowMaterials[1].color.lerp(themeTarget.green, 0.035);
      if (glowMaterials[2]) glowMaterials[2].color.lerp(themeTarget.blue, 0.035);
      if (glowMaterials[3]) glowMaterials[3].color.lerp(themeTarget.brass, 0.035);

      renderer.render(scene, camera);
      if (!reducedMotion) frameId = requestAnimationFrame(render);
    };

    render();

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = null;
      } else if (!reducedMotion && !frameId) {
        lastTime = clock.getElapsedTime();
        render();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      glowMaterials.forEach((material) => material.dispose());
      if (glowTexture) glowTexture.dispose();
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
