use creature_lab::dna::Specimen;
use creature_lab::edit::{EditOp, apply};
use creature_lab::rack::{Rack, RackParams};
use creature_lab::render::{FRAME_STRIDE, Request, render};
use creature_lab::{g2p_es, g2p_id, sfx, wav};
use chimera::phonetics::english::EnglishG2P;

const FS: f32 = 48000.0;

fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
}

fn finite(x: &[f32]) -> bool {
    x.iter().all(|v| v.is_finite())
}

/// a buzzy test voice: 120 Hz pulse train through a formant-ish filter, with an envelope
fn test_voice(secs: f32) -> Vec<f32> {
    let n = (secs * FS) as usize;
    let mut out = vec![0.0; n];
    let mut ph = 0.0f32;
    for (i, y) in out.iter_mut().enumerate() {
        let t = i as f32 / FS;
        ph += 120.0 / FS;
        if ph > 1.0 {
            ph -= 1.0;
        }
        let env = (t * 3.0).min(1.0) * (1.0 - (t / secs)).max(0.0);
        *y = (libm::sinf(core::f32::consts::TAU * ph) + 0.5 * libm::sinf(core::f32::consts::TAU * ph * 3.0)) * 0.3 * env;
    }
    out
}

fn specimens() -> Vec<(&'static str, Specimen)> {
    let s = |m, a, r, h, n, sp: &str| Specimen { monster: m, alien: a, robot: r, human: h, animal: n, species: sp.into(), ..Default::default() };
    vec![
        ("human", s(0.0, 0.0, 0.0, 1.0, 0.0, "none")),
        ("monster", s(1.0, 0.0, 0.0, 0.0, 0.0, "none")),
        ("alien", s(0.0, 1.0, 0.0, 0.0, 0.0, "none")),
        ("robot", s(0.0, 0.0, 1.0, 0.0, 0.0, "none")),
        ("animal", s(0.0, 0.0, 0.0, 0.0, 1.0, "none")),
        ("chimera", s(0.4, 0.2, 0.2, 0.1, 0.1, "none")),
    ]
}

#[test]
fn rack_is_finite_and_bounded_for_every_strand() {
    for (name, sp) in specimens() {
        let d = sp.design();
        let mut x = test_voice(2.0);
        let mut r = Rack::new(FS);
        r.set(&d.rack);
        r.process(&mut x);
        assert!(finite(&x), "{name}: non-finite output");
        assert!(peak(&x) <= 1.0, "{name}: peak {}", peak(&x));
        assert!(rms(&x) > 0.005, "{name}: silent ({})", rms(&x));
    }
}

#[test]
fn rack_extremes_hold_at_many_rates() {
    let mut p = RackParams::default();
    let mut a = p.to_array();
    for (i, v) in a.iter_mut().enumerate() {
        *v = creature_lab::rack::RANGES[i].1;
    }
    p = RackParams::from_array(&a);
    for fs in [16000.0, 22050.0, 44100.0, 48000.0, 96000.0] {
        let mut r = Rack::new(fs);
        r.set(&p);
        let mut x: Vec<f32> = (0..(fs as usize * 2)).map(|i| libm::sinf(i as f32 * 0.05) * 0.9).collect();
        r.process(&mut x);
        assert!(finite(&x) && peak(&x) <= 1.0, "fs {fs}: peak {}", peak(&x));
    }
}

#[test]
fn dna_maps_monster_low_and_alien_high() {
    let sp = specimens();
    let m = sp[1].1.design();
    let a = sp[2].1.design();
    assert!(m.pitch_semis < -10.0 && m.formant_semis < -5.0);
    assert!(a.pitch_semis > 5.0 && a.formant_semis > 3.0);
    assert!(m.source.fry > 0.5 && m.rack.sub > 0.5);
    let r = sp[3].1.design();
    assert!(r.rack.vocoder > 0.9 && r.source.vibrato_depth == 0.0);
    let s = sp[0].1.shares();
    assert!((s.h - 1.0).abs() < 1e-6);
}

#[test]
fn morph_interpolates_shares() {
    let sp = specimens();
    let mid = sp[0].1.lerp(&sp[1].1, 0.5).shares();
    assert!((mid.m - 0.5).abs() < 1e-5 && (mid.h - 0.5).abs() < 1e-5);
}

fn ipa(segs: &[chimera::phonetics::Segment]) -> String {
    segs.iter().map(|s| format!("{}{}", if s.stress == Some(1) { "ˈ" } else { "" }, s.ipa)).collect()
}

/// expectations are written with the stress mark at the syllable start; segments carry it on
/// the vowel, so move each mark to just before the next vowel
fn vowel_marked(s: &str) -> String {
    let mut out = String::new();
    let mut pending = false;
    for c in s.chars() {
        if c == 'ˈ' {
            pending = true;
            continue;
        }
        if pending && creature_lab::text::is_vowel(&c.to_string()) {
            out.push('ˈ');
            pending = false;
        }
        out.push(c);
    }
    out
}

#[test]
fn indonesian_g2p() {
    let cases = [
        ("selamat", "səˈlamat"),
        ("malam", "ˈmalam"),
        ("anak", "ˈanaʔ"),
        ("nyanyi", "ˈɲaɲi"),
        ("bunga", "ˈbuŋa"),
        ("cinta", "ˈtʃinta"),
        ("jalan", "ˈdʒalan"),
        ("pantai", "ˈpantaɪ"),
        ("pulau", "ˈpulaʊ"),
        ("rakyat", "ˈraʔjat"),
        ("syukur", "ˈʃukur"),
        ("enak", "ˈenaʔ"),
        ("sate", "ˈsate"),
        ("boleh", "ˈboleh"),
        ("besar", "bəˈsar"),
        ("kereta", "kəˈɾeta"),
        ("hantu", "ˈhantu"),
        ("suara", "suˈaɾa"),
    ];
    for (w, want) in cases {
        assert_eq!(ipa(&g2p_id::word(w)), vowel_marked(want), "{w}");
    }
    assert_eq!(g2p_id::number(1987), "seribu sembilan ratus delapan puluh tujuh");
    assert_eq!(g2p_id::number(12), "dua belas");
}

#[test]
fn spanish_g2p() {
    let cases = [
        ("hola", "ˈola"),
        ("noche", "ˈnotʃe"),
        ("calle", "ˈkaje"),
        ("perro", "ˈpero"),
        ("canción", "kanˈsjon"),
        ("monstruo", "ˈmonstɾwo"),
        ("ciudad", "sjuˈðad"),
        ("guerra", "ˈgera"),
        ("rojo", "ˈroxo"),
        ("niño", "ˈniɲo"),
        ("feliz", "feˈlis"),
    ];
    for (w, want) in cases {
        assert_eq!(ipa(&g2p_es::word(w)), vowel_marked(want), "{w}");
    }
    assert_eq!(g2p_es::number(31), "treinta y uno");
}

#[test]
fn every_sfx_category_renders() {
    for (id, _) in sfx::CATEGORIES {
        for seed in [1, 42] {
            let p = sfx::preset(id, seed);
            let x = sfx::render(&p, FS);
            assert!(finite(&x), "{id}");
            assert!(peak(&x) <= 1.0 && peak(&x) > 0.3, "{id} seed {seed}: peak {}", peak(&x));
            assert!(x.len() > 2000 && x.len() < 10 * FS as usize, "{id}: len {}", x.len());
        }
        let a = sfx::render(&sfx::preset(id, 9), FS);
        let b = sfx::render(&sfx::preset(id, 9), FS);
        assert_eq!(a, b, "{id} must be deterministic");
    }
}

#[test]
fn wav_roundtrip() {
    let x = test_voice(0.5);
    let b = wav::encode16(&x, 48000);
    assert_eq!(&b[0..4], b"RIFF");
    assert_eq!(b.len(), 44 + x.len() * 2);
    let (y, fs) = wav::decode(&b).unwrap();
    assert_eq!(fs, 48000);
    assert_eq!(y.len(), x.len());
    assert!(x.iter().zip(&y).all(|(a, b)| (a - b).abs() < 1e-3));
}

#[test]
fn edits() {
    let x = test_voice(1.0);
    assert_eq!(apply(&x, FS, &EditOp::Trim { start: 0.25, end: 0.75 }).len(), 24000);
    assert_eq!(apply(&x, FS, &EditOp::Speed { factor: 2.0 }).len(), 24000);
    let r = apply(&x, FS, &EditOp::Reverse);
    assert_eq!(r[0], x[x.len() - 1]);
    let n = apply(&x, FS, &EditOp::Normalize { db: -1.0 });
    assert!((peak(&n) - 0.891).abs() < 0.01);
    let e = apply(&x, FS, &EditOp::Echo { ms: 200.0, feedback: 0.5, mix: 0.5 });
    assert!(e.len() > x.len() && finite(&e) && peak(&e) <= 1.0);
}

fn req(job: serde_json::Value, sp: &Specimen) -> Request {
    serde_json::from_value(serde_json::json!({ "job": job, "specimen": sp })).unwrap()
}

fn check(name: &str, out: &(Vec<f32>, Vec<f32>, creature_lab::render::Meta)) {
    let (pcm, frames, meta) = out;
    assert!(finite(pcm), "{name}: non-finite");
    assert!(peak(pcm) <= 1.0, "{name}: peak {}", peak(pcm));
    assert!(rms(pcm) > 0.002, "{name}: silent (rms {})", rms(pcm));
    assert_eq!(frames.len(), meta.frames * FRAME_STRIDE);
    let expect = (pcm.len() as f64 / 48000.0 * 60.0) as usize;
    assert!(meta.frames + 2 >= expect && meta.frames <= expect + 2, "{name}: {} frames for {expect}", meta.frames);
    assert!(frames.iter().all(|v| v.is_finite()), "{name}: frames non-finite");
}

#[test]
fn speech_in_every_language() {
    let en = EnglishG2P::new();
    let sp = &specimens()[5].1;
    for (lang, text) in [("en", "Welcome to the monster lab, 13 specimens!"), ("id", "Selamat malam, aku monster dari laboratorium."), ("es", "Hola, soy el monstruo de la noche."), ("ipa", "ˈhɛloʊ ˈwɝld"), ("creature", "Bow before the swamp king")] {
        let t = std::time::Instant::now();
        let out = render(&req(serde_json::json!({ "kind": "speech", "text": text, "lang": lang }), sp), &en, &[]).unwrap();
        let secs = out.0.len() as f64 / 48000.0;
        println!("{lang}: {:.2} s audio in {:.0} ms — {}", secs, t.elapsed().as_secs_f64() * 1000.0, out.2.transcription);
        check(lang, &out);
        assert!(!out.2.segments.is_empty());
    }
}

#[test]
fn speech_word_spans() {
    let en = EnglishG2P::new();
    let out = render(&req(serde_json::json!({ "kind": "speech", "text": "Selamat malam semua", "lang": "id" }), &Specimen::default()), &en, &[]).unwrap();
    let w: Vec<&str> = out.2.words.iter().map(|s| s.text.as_str()).collect();
    assert_eq!(w, ["Selamat", "malam", "semua"]);
    assert!(out.2.words.windows(2).all(|p| p[0].t0 < p[1].t0));
}

#[test]
fn animal_splice_and_morph_sweep() {
    let en = EnglishG2P::new();
    for species in ["songbird", "seal", "alligator", "elephant"] {
        let sp = Specimen { human: 0.5, animal: 0.5, species: species.into(), ..Default::default() };
        let t = std::time::Instant::now();
        let out = render(&req(serde_json::json!({ "kind": "speech", "text": "I am alive", "lang": "en" }), &sp), &en, &[]).unwrap();
        println!("splice {species}: {:.0} ms", t.elapsed().as_secs_f64() * 1000.0);
        check(species, &out);
        assert!(out.1.chunks(FRAME_STRIDE).any(|f| f[19] > 0.05), "{species}: the animal never breathed");
    }
    let r: Request = serde_json::from_value(serde_json::json!({
        "job": { "kind": "speech", "text": "From man to monster", "lang": "en" },
        "specimen": Specimen::default(),
        "morph": { "to": specimens()[1].1, "amount": 1.0, "sweep": true }
    }))
    .unwrap();
    check("sweep", &render(&r, &en, &[]).unwrap());
}

#[test]
fn song_beat_call_vocal_sfx_process() {
    let en = EnglishG2P::new();
    let sp = &specimens()[1].1;
    let song = serde_json::json!({ "kind": "song", "lyrics": "la la la la", "lang": "en", "bpm": 110, "vibrato": 30,
        "notes": [{ "midi": 57, "beats": 1 }, { "midi": 60, "beats": 1 }, { "midi": 64, "beats": 1 }, { "midi": 62, "beats": 2 }] });
    check("song", &render(&req(song, sp), &en, &[]).unwrap());
    let song_id = serde_json::json!({ "kind": "song", "lyrics": "bulan bintang", "lang": "id", "bpm": 90, "notes": [{ "midi": 60, "beats": 1 }, { "midi": 62, "beats": 1 }, { "midi": 64, "beats": 1 }, { "midi": 65, "beats": 2 }] });
    check("song-id", &render(&req(song_id, sp), &en, &[]).unwrap());
    let preset = chimera::phonetics::beatbox::BEAT_PRESETS[0].text;
    check("beat", &render(&req(serde_json::json!({ "kind": "beat", "pattern": preset, "bpm": 96, "bars": 1 }), &Specimen::default()), &en, &[]).unwrap());
    for c in chimera::creatures::CREATURES.iter() {
        let call = c.calls[0].id;
        check(c.id, &render(&req(serde_json::json!({ "kind": "call", "species": c.id, "call": call }), &Specimen::default()), &en, &[]).unwrap());
    }
    for (v, _) in creature_lab::render::VOCALS {
        check(v, &render(&req(serde_json::json!({ "kind": "vocal", "vocal": v, "seed": 3 }), &Specimen::default()), &en, &[]).unwrap());
    }
    let p = sfx::preset("laser", 2);
    check("sfx", &render(&req(serde_json::json!({ "kind": "sfx", "params": p, "dna": true }), sp), &en, &[]).unwrap());
    let voice = test_voice(1.5);
    check("process", &render(&req(serde_json::json!({ "kind": "process", "sampleRate": 48000 }), sp), &en, &voice).unwrap());
    let sp_seal = Specimen { monster: 0.5, animal: 0.5, species: "seal".into(), ..Default::default() };
    check("process-seal", &render(&req(serde_json::json!({ "kind": "process" }), &sp_seal), &en, &voice).unwrap());
}
