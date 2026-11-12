import type { CSSProperties, ReactNode } from "react";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.01, color, format, onChange, onCommit } = props;
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <label>
        {label} <b>{format ? format(value) : value.toFixed(step >= 1 ? 0 : 2)}</b>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--p": `${p}%`, "--c": color } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit?.(parseFloat((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

export function Chips<T extends string>(props: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {props.options.map((o) => (
        <button key={o.id} className={`chip ${o.id === props.value ? "on" : ""}`} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel(props: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${props.className ?? ""}`}>
      {props.title && (
        <h2>
          {props.title}
          {props.hint && <span className="hint">{props.hint}</span>}
        </h2>
      )}
      {props.children}
    </section>
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet" role="dialog" aria-label={props.title}>
        <div className="grip" />
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const semis = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} st`;
