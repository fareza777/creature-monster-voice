/** Background field of drifting spores and embers in the dark lab (2D canvas, 30 fps, paused when hidden). */
import { useEffect, useRef } from "react";

export function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const colors = ["164,91,255", "57,255,136", "57,255,136", "255,122,26", "45,226,255"];
    let w = 0, h = 0;
    const N = 22;
    const ps = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.6, v: 0.004 + Math.random() * 0.012, d: Math.random() * Math.PI * 2, c: colors[Math.floor(Math.random() * colors.length)] }));
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    let raf = 0, last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v * dt * 6;
        p.d += dt * 0.6;
        p.x += Math.sin(p.d) * 0.0006;
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }
        const a = 0.06 + 0.24 * Math.sin(p.d * 2) ** 2;
        g.beginPath();
        g.fillStyle = `rgba(${p.c},${a})`;
        g.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        g.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas className="particles" ref={ref} />;
}
