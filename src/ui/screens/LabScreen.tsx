/** Lab: the full-screen hologram with live readouts and a quick "speak" bar. */
import { useEffect, useState } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { F } from "../../engine/lab.ts";
import { OrganCard, resetStageView, setXray } from "../components/Stage.tsx";
import { Icon } from "../icons.tsx";

function Readouts() {
  const [xray, setX] = useState(false);
  useEffect(() => () => setXray(false), []);
  const [r, setR] = useState({ f0: 0, lvl: 0, jaw: 0, port: 0 });
  useEffect(() => {
    let raf = 0, n = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (++n % 4) return;
      const f = audio.currentFrame();
      setR(f ? { f0: f[F.VOICING] > 0.3 ? f[F.F0] : 0, lvl: Math.min(1, f[F.LEVEL] * 2.2), jaw: f[F.JAW], port: f[F.VELUM_PORT] } : { f0: 0, lvl: 0, jaw: 0, port: 0 });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div className="lab-stats">
        <div>
          PITCH <b>{r.f0 > 0 ? `${r.f0.toFixed(0)} Hz` : "—"}</b>
        </div>
        <div>
          JAW <b>{(r.jaw * 100).toFixed(0)}</b>
        </div>
        <div>
          NASAL <b>{r.port > 0.05 ? "OPEN" : "SEALED"}</b>
        </div>
      </div>
      <div className="lab-side">
        <div className="meter" aria-label="Output level">
          <i style={{ height: `${r.lvl * 100}%` }} />
        </div>
        <button className={`btn small toggle-xray ${xray ? "on" : ""}`} onClick={() => (setX(!xray), setXray(!xray))} aria-label="X-ray anatomy">
          X-ray
        </button>
        <button className="btn icon small" onClick={resetStageView} aria-label="Reset view">
          {Icon.rotate}
        </button>
      </div>
    </>
  );
}

export function LabScreen() {
  const speak = useApp((s) => s.speak);
  const patch = useApp((s) => s.patch);
  const renderJob = useApp((s) => s.renderJob);
  const name = useApp((s) => s.specimenName);
  const go = useApp((s) => s.go);
  const say = () => renderJob({ kind: "speech", text: speak.text, lang: speak.lang, dialect: speak.dialect }, `${name}: ${speak.text.slice(0, 28)}`);
  return (
    <>
      <Readouts />
      <OrganCard />
      <div className="lab-hud">
        <div className="row">
          <div className="chips grow" style={{ paddingBottom: 0 }}>
            <button className="chip" onClick={() => renderJob({ kind: "vocal", vocal: "roar", seed: Date.now() % 1000 }, `${name} roar`)}>
              🦖 Roar
            </button>
            <button className="chip" onClick={() => renderJob({ kind: "vocal", vocal: "laugh", seed: Date.now() % 1000 }, `${name} laugh`)}>
              😈 Laugh
            </button>
            <button className="chip" onClick={() => renderJob({ kind: "vocal", vocal: "moan", seed: Date.now() % 1000 }, `${name} moan`)}>
              👻 Moan
            </button>
            <button className="chip" onClick={() => renderJob({ kind: "vocal", vocal: "scream", seed: Date.now() % 1000 }, `${name} scream`)}>
              😱 Scream
            </button>
          </div>
          <button className="btn small violet" onClick={() => go("dna")}>
            Splice
          </button>
        </div>
        <div className="quick-speak">
          <input type="text" value={speak.text} onChange={(e) => patch("speak", { text: e.target.value })} placeholder="Type something for your specimen to say…" onKeyDown={(e) => e.key === "Enter" && say()} />
          <button className="btn primary" onClick={say}>
            Speak
          </button>
        </div>
      </div>
    </>
  );
}
