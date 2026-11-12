//! Render the vocal effects for a few specimens to WAV and print an envelope / pitch analysis.
//! `cargo run -p creature-lab --release --example vocals -- [vocal] [out-dir]`
use chimera::phonetics::english::EnglishG2P;
use creature_lab::dna::Specimen;
use creature_lab::render::{FRAME_STRIDE, Request, VOCALS, render};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let only = args.first().cloned().unwrap_or_default();
    let dir = args.get(1).cloned().unwrap_or_else(|| "out/vocals".into());
    std::fs::create_dir_all(&dir).unwrap();
    let en = EnglishG2P::new();
    let s = |m, a, r, h, n, sp: &str, size: f32, rasp: f32| Specimen { monster: m, alien: a, robot: r, human: h, animal: n, species: sp.into(), size, rasp, ..Default::default() };
    let specs = [
        ("human", Specimen::default()),
        ("ogre", s(0.6, 0.0, 0.0, 0.1, 0.3, "alligator", -1.0, 0.3)),
        ("demon", Specimen { reverb: 0.6, ..s(0.9, 0.0, 0.0, 0.1, 0.0, "none", -3.0, 0.0) }),
        ("goblin", Specimen { child: 1.0, pitch: 4.0, ..s(0.3, 0.15, 0.0, 0.55, 0.0, "none", 0.0, 0.5) }),
    ];
    for (v, _) in VOCALS {
        if !only.is_empty() && *v != only {
            continue;
        }
        for (name, sp) in &specs {
            let req: Request = serde_json::from_value(serde_json::json!({ "job": { "kind": "vocal", "vocal": v, "seed": 7 }, "specimen": sp })).unwrap();
            let (pcm, frames, meta) = render(&req, &en, &[]).unwrap();
            let path = format!("{dir}/{name}_{v}.wav");
            std::fs::write(&path, creature_lab::wav::encode16(&pcm, 48000)).unwrap();
            // 20 ms RMS envelope (dB) and the f0 / voicing track at 60 fps
            let hop = 960;
            let env: Vec<f32> = pcm.chunks(hop).map(|c| 20.0 * (c.iter().map(|x| x * x).sum::<f32>() / c.len() as f32).sqrt().max(1e-5).log10()).collect();
            let peak = pcm.iter().fold(0.0f32, |m, x| m.max(x.abs()));
            println!("== {name}/{v}: {:.2} s, peak {peak:.2}", pcm.len() as f32 / 48000.0);
            let line: String = env.iter().map(|d| { let k = ((d + 50.0) / 6.0).clamp(0.0, 8.0) as usize; [' ', '.', ':', '-', '=', '+', '*', '#', '@'][k] }).collect();
            println!("   env |{line}|");
            let f0: Vec<String> = frames.chunks(FRAME_STRIDE).step_by(3).map(|f| if f[11] > 0.3 { format!("{:.0}", f[10]) } else { "-".into() }).collect();
            println!("   f0  {}", f0.join(" "));
            let segs: Vec<String> = meta.segments.iter().map(|s| format!("{}@{:.2}", s.text, s.t0)).collect();
            println!("   seg {}", segs.join(" "));
        }
    }
}
