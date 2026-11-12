//! Probe one vocal for one specimen: `cargo run --example probe -- hiss child=1 intensity=0`
use chimera::phonetics::english::EnglishG2P;
use creature_lab::render::{Request, render};

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let mut sp = serde_json::Map::new();
    for kv in &a[1..] {
        let (k, v) = kv.split_once('=').unwrap();
        sp.insert(k.into(), v.parse::<f64>().map(serde_json::Value::from).unwrap_or_else(|_| v.into()));
    }
    let req: Request = serde_json::from_value(serde_json::json!({ "job": { "kind": "vocal", "vocal": a[0], "seed": 7 }, "specimen": sp })).unwrap();
    let (pcm, _, meta) = render(&req, &EnglishG2P::new(), &[]).unwrap();
    let peak = pcm.iter().fold(0.0f32, |m, x| m.max(x.abs()));
    let rms = (pcm.iter().map(|x| x * x).sum::<f32>() / pcm.len() as f32).sqrt();
    println!("peak {peak:.3} rms {rms:.4} f0 {:.0} pressure {:.1} shift {:.1}", meta.design.source.f0, meta.design.source.pressure, meta.design.rack.shift);
}
