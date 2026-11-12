/** The persistent 3D stage: one WebGL context for the whole app (the Specimen). */
import { useEffect, useRef, useState } from "react";
import { SpecimenScene, ORGAN_INFO } from "../../three/specimen.ts";
import { audio } from "../../audio/audio.ts";
import { useApp } from "../../store/app.ts";

let scene: SpecimenScene | null = null;

export function resetStageView(): void {
  scene?.resetView();
}

export function setXray(on: boolean): void {
  scene?.setXray(on);
}

export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const shares = useApp((s) => s.design.shares);
  const skin = useApp((s) => s.specimen.skin);
  const setOrgan = useApp((s) => s.setOrgan);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    try {
      scene = new SpecimenScene(host.current, () => audio.currentFrame());
      scene.onPick((o) => setOrgan(o));
      scene.onReady = () => setReady(true);
      scene.setShares(useApp.getState().design.shares);
      scene.setSkin(useApp.getState().specimen.skin);
      (window as unknown as Record<string, unknown>).__scene = scene;
    } catch (e) {
      console.error("WebGL unavailable:", e);
    }
    return () => {
      scene?.dispose();
      scene = null;
    };
  }, [setOrgan]);
  useEffect(() => {
    scene?.setShares(shares);
  }, [shares]);
  useEffect(() => {
    scene?.setSkin(skin);
  }, [skin]);
  return (
    <div className="stage" ref={host}>
      {!ready && <div className="stage-loading">Sculpting your specimen…</div>}
    </div>
  );
}

export function OrganCard() {
  const organ = useApp((s) => s.organ);
  const setOrgan = useApp((s) => s.setOrgan);
  if (!organ) return null;
  const info = ORGAN_INFO[organ];
  return (
    <div className="organ-card" onClick={() => setOrgan(null)}>
      <b>{info.name}</b>
      <p>{info.text}</p>
    </div>
  );
}
