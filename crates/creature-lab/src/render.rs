//! Offline rendering sessions: a job (speech, song, beat, animal call, vocal effect, synth SFX,
//! or processing a recorded clip) rendered through a specimen's design in steps, so the worker
//! can report progress. Each session also records a 60 fps telemetry track ([`FRAME_STRIDE`]
//! floats per frame) that drives the 3D anatomy during playback.
//!
//! The animal splice: a second engine plays the chosen creature airway; its breath gate follows
//! the human voice's envelope and its pitch parameter follows the human f0, so the animal
//! "speaks" the same words in the same rhythm and melody.

use crate::dna::{Design, Specimen};
use crate::dsp::{Envelope, Limiter, clamp};
use crate::rack::{Rack, RackParams};
use crate::sfx::{self, SfxParams};
use crate::text;
use crate::{creature_tongue, g2p_es, g2p_id};
use chimera::anatomy::human::BodyMix;
use chimera::creatures::creature_by_id;
use chimera::creatures::types::ParamRole;
use chimera::creatures::voice::CreatureTelemetry;
use chimera::engine::Engine;
use chimera::phonetics::beatbox::{beat_ready, parse_beat};
use chimera::phonetics::english::{EnglishG2P, Phrase};
use chimera::phonetics::planner::{self, PhraseInput, PlanOptions};
use chimera::phonetics::sing::{SongOptions, SungNote, plan_song};
use chimera::phonetics::syllables::lyrics_to_syllables;
use chimera::phonetics::{Intonation, Plan, Segment, Syllable};
use chimera::voice::human_voice::{SourcePatch, VoiceTelemetry};
use serde::{Deserialize, Serialize};

pub const FRAME_RATE: f64 = 60.0;
/// floats per telemetry frame
pub const FRAME_STRIDE: usize = 56;
/// frame layout: scalars, then 16 pharynx + 16 oral cross-section areas (cm²)
pub mod frame {
    pub const JAW: usize = 0;
    pub const TB_X: usize = 1;
    pub const TB_Y: usize = 2;
    pub const TT_X: usize = 3;
    pub const TT_Y: usize = 4;
    pub const LIP_AP: usize = 5;
    pub const LIP_PROT: usize = 6;
    pub const LIP_WIDTH: usize = 7;
    pub const VELUM: usize = 8;
    pub const LARYNX: usize = 9;
    pub const F0: usize = 10;
    pub const VOICING: usize = 11;
    pub const P_LUNG: usize = 12;
    pub const LEVEL: usize = 13;
    pub const GATE: usize = 14;
    pub const GLOTTIS: usize = 15;
    pub const VELUM_PORT: usize = 16;
    pub const NOISE: usize = 17;
    pub const FLOW: usize = 18;
    pub const ANIMAL: usize = 19;
    pub const AREAS: usize = 24;
    pub const N_AREAS: usize = 32;
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteIn {
    pub midi: f64,
    pub beats: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Job {
    Speech {
        text: String,
        #[serde(default)]
        lang: String,
        #[serde(default)]
        dialect: Option<String>,
        #[serde(default)]
        intonation: Option<String>,
    },
    Song {
        notes: Vec<NoteIn>,
        lyrics: String,
        #[serde(default)]
        lang: String,
        bpm: f64,
        #[serde(default)]
        vibrato: f64,
    },
    Beat {
        pattern: String,
        bpm: f64,
        #[serde(default)]
        swing: f64,
        #[serde(default)]
        bars: f64,
    },
    Call {
        species: String,
        call: String,
        #[serde(default)]
        pitch: Option<f64>,
    },
    Vocal {
        vocal: String,
        #[serde(default)]
        seed: u32,
    },
    Sfx {
        params: SfxParams,
        #[serde(default)]
        dna: bool,
    },
    /// the clip in the input buffer (a recording or an edited clip) through the specimen
    Process {
        #[serde(default)]
        sample_rate: Option<f64>,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Morph {
    pub to: Specimen,
    pub amount: f32,
    /// glide from the specimen to `to` across the clip
    #[serde(default)]
    pub sweep: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub job: Job,
    #[serde(default)]
    pub specimen: Specimen,
    #[serde(default)]
    pub morph: Option<Morph>,
    #[serde(default)]
    pub sample_rate: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Span {
    pub text: String,
    pub t0: f64,
    pub t1: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub sample_rate: f64,
    pub samples: usize,
    pub frames: usize,
    pub frame_rate: f64,
    pub stride: usize,
    pub segments: Vec<Span>,
    pub words: Vec<Span>,
    pub transcription: String,
    pub design: Design,
    pub kind: String,
}

/// Physical vocal effects (the human airway pushed into creature territory).
pub const VOCALS: &[(&str, &str)] = &[
    ("roar", "Beast Roar"),
    ("growl", "Low Growl"),
    ("laugh", "Evil Laugh"),
    ("cackle", "Witch Cackle"),
    ("moan", "Ghost Moan"),
    ("groan", "Zombie Groan"),
    ("scream", "Banshee Scream"),
    ("hiss", "Serpent Hiss"),
    ("snarl", "Snarl"),
    ("chant", "Dark Chant"),
];

pub const LANGUAGES: &[(&str, &str)] = &[("en", "English"), ("id", "Indonesian"), ("es", "Spanish"), ("ipa", "IPA"), ("creature", "Creature Tongue")];

// ------------------------------------------------------------------ text → phrases

/// Text in a language → phrases (the English G2P is the caller's, with CMUdict loaded or not).
pub fn phrases_for(text_in: &str, lang: &str, dialect: Option<&str>, en: &EnglishG2P) -> Vec<Phrase> {
    match lang {
        "id" => text::phrases(text_in, &g2p_id::number, &g2p_id::word),
        "es" => text::phrases(text_in, &g2p_es::number, &g2p_es::word),
        "creature" => {
            let d = creature_tongue::dialect(dialect.unwrap_or("guttural"));
            text::phrases(text_in, &creature_tongue::number, &|w: &str| creature_tongue::word(w, d))
        }
        "ipa" => text_in
            .split(['|', '.', '?', '!', '\n'])
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(|p| Phrase { segments: chimera::phonetics::ipa::tokenize_ipa(p), intonation: Intonation::Statement, pause: 0.3, words: p.split_whitespace().map(str::to_string).collect() })
            .filter(|p| !p.segments.is_empty())
            .collect(),
        _ => en.to_phrases(&text::expand_english_numbers(text_in)),
    }
}

/// The IPA a listener would read for these phrases.
pub fn transcribe(phrases: &[Phrase]) -> String {
    phrases
        .iter()
        .map(|p| {
            let s: String = p.segments.iter().map(|s| format!("{}{}{}", if s.stress == Some(1) { "ˈ" } else { "" }, s.ipa, if s.word_end == Some(true) { " " } else { "" })).collect();
            s.trim().to_string() + if p.intonation == Intonation::Question { "?" } else { "" }
        })
        .collect::<Vec<_>>()
        .join(" | ")
}

/// Word spans in a plan of these phrases (planned segment counts follow `planner::expand`).
fn word_spans(phrases: &[Phrase], plan: &Plan) -> Vec<Span> {
    let mut out = Vec::new();
    let mut k = 0usize;
    for p in phrases {
        let mut w = 0usize;
        let mut start: Option<usize> = None;
        for s in &p.segments {
            if s.ipa == "_" {
                k += 1;
                continue;
            }
            let n = planner::expand(&s.ipa).map_or(1, |e| e.len());
            if start.is_none() {
                start = Some(k);
            }
            k += n;
            if s.word_end == Some(true) {
                let (a, b) = (start.unwrap_or(k - n), k.saturating_sub(1));
                if let (Some(sa), Some(sb)) = (plan.segments.get(a), plan.segments.get(b)) {
                    out.push(Span { text: p.words.get(w).cloned().unwrap_or_default(), t0: sa.t0, t1: sb.t1 });
                }
                w += 1;
                start = None;
            }
        }
    }
    out
}

fn to_inputs(phrases: &[Phrase], intonation: Option<&str>) -> Vec<PhraseInput> {
    let force = match intonation {
        Some("question") => Some(Intonation::Question),
        Some("flat") => Some(Intonation::Flat),
        Some("statement") => Some(Intonation::Statement),
        _ => None,
    };
    phrases.iter().map(|p| PhraseInput { segments: p.segments.clone(), intonation: Some(force.unwrap_or(p.intonation)), pause: Some(p.pause) }).collect()
}

/// Lyrics → syllables in a language.
pub fn syllables_for(lyrics: &str, lang: &str, en: &EnglishG2P) -> Vec<Syllable> {
    match lang {
        "id" => lyrics_to_syllables(lyrics, &|w: &str, _r: bool| g2p_id::word(w)),
        "es" => lyrics_to_syllables(lyrics, &|w: &str, _r: bool| g2p_es::word(w)),
        "creature" => lyrics_to_syllables(lyrics, &|w: &str, _r: bool| creature_tongue::word(w, &creature_tongue::GUTTURAL)),
        _ => lyrics_to_syllables(lyrics, &|w: &str, r: bool| en.word(w, r)),
    }
}

// ------------------------------------------------------------------ vocal effects

struct VocalPlan {
    segments: Vec<Segment>,
    source: SourcePatch,
    rack: Option<RackParams>,
    /// laughter: each vowel after an [h] is its own expiratory pulse (breath peak, falling
    /// pitch, quiet aspirated gap), as the diaphragm drives a real laugh
    pulses: Option<Pulses>,
}

#[derive(Clone, Copy)]
struct Pulses {
    /// breath multiplier at the first and the last pulse (a laugh builds)
    from: f64,
    to: f64,
    /// breath in the [h] gaps
    gap: f64,
    /// pitch at the end of each pulse relative to its start
    fall: f64,
}

/// Breath and pitch gestures that turn "h-a h-a h-a" into laughter: a pressure peak on every
/// vowel, the breath held low through the aspirated gaps, and a pitch drop inside each pulse.
fn add_pulses(plan: &mut Plan, p: &Pulses) {
    use chimera::control::score::{ControlKey, Gesture, Targets};
    let segs = &plan.segments;
    let idx: Vec<usize> = (0..segs.len()).filter(|&i| text::is_vowel(&segs[i].ipa) && i > 0 && segs[i - 1].ipa == "h").collect();
    let n = idx.len().max(1);
    for (k, &i) in idx.iter().enumerate() {
        let (t0, t1) = (segs[i].t0, segs[i].t1);
        let dur = t1 - t0;
        let peak = p.from + (p.to - p.from) * k as f64 / (n - 1).max(1) as f64;
        plan.gestures.push(Gesture::new(t0 - 0.012, t1 - 0.25 * dur, 0.015, 0.4 * dur, 4.0, Targets::default().with(ControlKey::BREATH, peak)).label("laugh pulse"));
        let h = &segs[i - 1];
        plan.gestures.push(Gesture::new(h.t0 + 0.005, h.t1 - 0.01, 0.015, 0.015, 4.0, Targets::default().with(ControlKey::BREATH, p.gap)).label("laugh gap"));
        // the pitch falls through the pulse: start a little above the planned target
        let f = plan.gestures.iter().rev().find(|g| g.label.is_some_and(|l| l.as_str() == "pitch") && (g.t0 - t0).abs() < 1e-6).and_then(|g| g.targets.get(ControlKey::F0));
        if let Some(f) = f {
            plan.gestures.push(Gesture::new(t0, t0 + 0.35 * dur, 0.01, 0.03, 12.0, Targets::default().with(ControlKey::F0, f * 1.08)).label("pitch"));
            plan.gestures.push(Gesture::new(t0 + 0.55 * dur, t1 + 0.02, 0.04, 0.03, 12.0, Targets::default().with(ControlKey::F0, f * p.fall)).label("pitch"));
        }
    }
}

fn seg(ipa: &str, dur: f64, f0: Option<f64>) -> Segment {
    Segment { ipa: ipa.into(), dur: Some(dur), f0, stress: Some(if text::is_vowel(ipa) { 1 } else { 0 }), word_end: None }
}

fn vocal_plan(kind: &str, seed: u32, f0_base: f64) -> VocalPlan {
    let mut r = crate::dsp::Rng::new(seed.wrapping_mul(747_796_405).wrapping_add(1));
    let v = |r: &mut crate::dsp::Rng, x: f64| x * (1.0 + 0.12 * r.bipolar() as f64);
    let fb = f0_base;
    let mut src = SourcePatch::default();
    let rack;
    let mut pulses = None;
    let segments = match kind {
        "roar" => {
            src.pressure = Some(15.0);
            src.fry = Some(0.85);
            src.roughness = Some(0.95);
            src.tension = Some(0.3);
            rack = Some(RackParams { shift: -6.0, shift_mix: 1.0, sub: 0.7, growl: 0.85, drive: 0.4, reverb: 0.35, room: 0.8, ..Default::default() });
            vec![seg("ʁ", 0.14, Some(fb * 1.1)), seg("ɑ", v(&mut r, 0.35), Some(fb * 1.4)), seg("ɑ", 0.35, Some(fb * 1.1)), seg("ɑ", 0.35, Some(fb * 0.8)), seg("ɔ", v(&mut r, 0.4), Some(fb * 0.6))]
        }
        "growl" => {
            // one continuous rumble from the back of the throat: no trills (a trill in a rough,
            // low voice stalls into silence), the rack's growl does the rattling
            src.pressure = Some(12.0);
            src.fry = Some(1.0);
            src.roughness = Some(0.9);
            rack = Some(RackParams { shift: -5.0, shift_mix: 1.0, sub: 0.6, growl: 0.9, growl_rate: 24.0, drive: 0.3, reverb: 0.2, ..Default::default() });
            vec![seg("ɣ", 0.16, Some(fb * 0.7)), seg("ʌ", v(&mut r, 0.45), Some(fb * 0.72)), seg("ɤ", v(&mut r, 0.4), Some(fb * 0.66)), seg("ʌ", v(&mut r, 0.45), Some(fb * 0.7)), seg("ɯ", v(&mut r, 0.35), Some(fb * 0.58))]
        }
        "laugh" => {
            // a villain's laugh: a low "mwa", a run of chest pulses that climbs and builds, and
            // a long falling "haaa" to finish. No echo: it would fill the gaps between pulses.
            src.pressure = Some(11.0);
            src.roughness = Some(0.4);
            rack = Some(RackParams { shift: -3.0, shift_mix: 1.0, reverb: 0.3, room: 0.8, ..Default::default() });
            pulses = Some(Pulses { from: 1.05, to: 1.45, gap: 0.35, fall: 0.86 });
            let mut s = vec![seg("m", 0.11, Some(fb * 1.15)), seg("w", 0.05, Some(fb * 1.3)), seg("ɑ", 0.26, Some(fb * 1.45))];
            let n = 6 + (r.unit() * 3.0) as usize;
            for i in 0..n {
                let k = i as f64 / (n - 1) as f64;
                // the pitch climbs to the middle of the run and sinks again
                let f = fb * (1.35 + 0.35 * (k * core::f64::consts::PI).sin() - 0.1 * k) * (1.0 + 0.04 * r.bipolar() as f64);
                s.push(seg("h", if i == 0 { 0.13 } else { v(&mut r, 0.075) }, None));
                s.push(seg("ɑ", v(&mut r, 0.115), Some(f)));
            }
            s.push(seg("h", 0.09, None));
            s.push(seg("ɑ", 0.55, Some(fb * 1.6)));
            s.push(seg("ɑ", 0.25, Some(fb * 1.0)));
            s
        }
        "cackle" => {
            // a witch's "hee-hee-hee": fast, high, tense pulses with a shrill last one
            src.pressure = Some(10.0);
            src.tension = Some(0.85);
            src.roughness = Some(0.45);
            rack = Some(RackParams { shift: 3.0, shift_mix: 1.0, reverb: 0.3, ..Default::default() });
            pulses = Some(Pulses { from: 1.1, to: 1.35, gap: 0.3, fall: 0.8 });
            let mut s = Vec::new();
            let n = 8 + (r.unit() * 3.0) as usize;
            for i in 0..n {
                let k = i as f64 / (n - 1) as f64;
                s.push(seg("h", v(&mut r, 0.05), None));
                s.push(seg(if i % 3 == 2 { "ɪ" } else { "i" }, v(&mut r, 0.085), Some(fb * (3.0 - 0.6 * k))));
            }
            s.push(seg("h", 0.06, None));
            s.push(seg("i", 0.45, Some(fb * 3.4)));
            s
        }
        "moan" => {
            src.breathiness = Some(0.6);
            src.vibrato_depth = Some(45.0);
            src.vibrato_rate = Some(4.5);
            rack = Some(RackParams { flanger: 0.5, reverb: 0.7, room: 0.95, echo: 0.3, echo_ms: 380.0, ..Default::default() });
            vec![seg("u", v(&mut r, 0.7), Some(fb * 2.4)), seg("o", 0.6, Some(fb * 2.0)), seg("u", v(&mut r, 0.9), Some(fb * 2.3)), seg("o", 0.7, Some(fb * 1.8))]
        }
        "groan" => {
            src.pressure = Some(11.0);
            src.fry = Some(0.9);
            src.breathiness = Some(0.4);
            src.roughness = Some(0.7);
            rack = Some(RackParams { shift: -4.0, shift_mix: 1.0, growl: 0.4, growl_rate: 14.0, reverb: 0.25, ..Default::default() });
            vec![seg("ʌ", v(&mut r, 0.6), Some(fb * 0.8)), seg("ɤ", 0.5, Some(fb * 0.75)), seg("ɯ", v(&mut r, 0.6), Some(fb * 0.65)), seg("ŋ", 0.3, Some(fb * 0.6))]
        }
        "scream" => {
            src.pressure = Some(16.0);
            src.tension = Some(0.95);
            src.roughness = Some(0.6);
            rack = Some(RackParams { shift: 2.0, shift_mix: 1.0, drive: 0.35, flanger: 0.3, reverb: 0.5, room: 0.9, ..Default::default() });
            vec![seg("æ", v(&mut r, 0.3), Some(fb * 4.5)), seg("i", v(&mut r, 0.7), Some(fb * 5.5)), seg("i", 0.4, Some(fb * 4.0))]
        }
        "hiss" => {
            src.pressure = Some(12.0);
            rack = Some(RackParams { trill: 0.3, trill_rate: 18.0, reverb: 0.2, ..Default::default() });
            vec![seg("h", 0.15, None), seg("s", v(&mut r, 0.6), None), seg("ʃ", v(&mut r, 0.6), None), seg("s", 0.4, None)]
        }
        "snarl" => {
            src.pressure = Some(13.0);
            src.fry = Some(0.7);
            src.roughness = Some(1.0);
            rack = Some(RackParams { shift: -5.0, shift_mix: 1.0, growl: 1.0, growl_rate: 40.0, drive: 0.5, ..Default::default() });
            vec![seg("ɣ", 0.1, Some(fb)), seg("ɛ", v(&mut r, 0.2), Some(fb * 1.3)), seg("r", 0.4, Some(fb * 1.1)), seg("æ", 0.25, Some(fb * 1.5)), seg("x", 0.2, None)]
        }
        _ => {
            // chant: a low drone on a repeated syllable
            src.fry = Some(0.3);
            rack = Some(RackParams { sub: 0.5, reverb: 0.8, room: 1.0, echo: 0.2, echo_ms: 500.0, ..Default::default() });
            let mut s = Vec::new();
            for word in ["o", "m", "a", "m", "o", "ŋ"] {
                s.push(seg(word, if text::is_vowel(word) { v(&mut r, 0.6) } else { 0.25 }, Some(fb * 0.9)));
            }
            s
        }
    };
    VocalPlan { segments, source: src, rack, pulses }
}

// ------------------------------------------------------------------ the session

/// A whole-tract area profile resampled to `n` points.
fn resample_into(src: &[f32], dst: &mut [f32]) {
    let n = dst.len();
    if src.is_empty() {
        dst.iter_mut().for_each(|x| *x = 2.0);
        return;
    }
    for (i, d) in dst.iter_mut().enumerate() {
        let p = i as f32 * (src.len() - 1) as f32 / (n - 1).max(1) as f32;
        let k = p as usize;
        let fr = p - k as f32;
        let a = src[k.min(src.len() - 1)];
        let b = src[(k + 1).min(src.len() - 1)];
        *d = a + (b - a) * fr;
    }
}

/// Fill a frame from human-voice telemetry.
pub fn frame_from_telemetry(t: &VoiceTelemetry, level: f32, out: &mut [f32]) {
    use frame::*;
    let a = |i: usize| t.artic.get(i).copied().unwrap_or(0.0);
    out[JAW] = a(0);
    out[TB_X] = a(1);
    out[TB_Y] = a(2);
    out[TT_X] = a(3);
    out[TT_Y] = a(4);
    out[LIP_AP] = a(7);
    out[LIP_PROT] = a(8);
    out[LIP_WIDTH] = a(9);
    out[VELUM] = a(11);
    out[LARYNX] = a(12);
    out[F0] = t.f0 as f32;
    out[VOICING] = t.voicing as f32;
    out[P_LUNG] = t.p_lung as f32;
    out[LEVEL] = level;
    out[GATE] = t.gate as f32;
    let g = &t.glottal_area;
    out[GLOTTIS] = if g.is_empty() { 0.0 } else { g.iter().sum::<f32>() / g.len() as f32 };
    out[VELUM_PORT] = t.velum_port as f32;
    out[NOISE] = t.noise_level as f32;
    out[FLOW] = if t.flow.is_empty() { 0.0 } else { t.flow.iter().map(|x| x.abs()).sum::<f32>() / t.flow.len() as f32 };
    let half = N_AREAS / 2;
    resample_into(&t.ph_areas, &mut out[AREAS..AREAS + half]);
    resample_into(&t.or_areas, &mut out[AREAS + half..AREAS + N_AREAS]);
}

/// A frame for sound with no human airway behind it (SFX, recordings, creatures): the mouth
/// opens with the level, the folds buzz with it.
pub fn frame_from_level(level: f32, animal: f32, out: &mut [f32]) {
    use frame::*;
    let o = clamp(level * 3.0, 0.0, 1.0);
    out.iter_mut().for_each(|x| *x = 0.0);
    out[JAW] = 0.15 + 0.85 * o;
    out[TB_X] = 2.9;
    out[TB_Y] = 7.6 - 0.4 * o;
    out[TT_X] = 5.9;
    out[TT_Y] = 8.8 - 0.6 * o;
    out[LIP_AP] = 0.3 + 1.4 * o;
    out[LIP_WIDTH] = 0.5;
    out[VELUM] = 0.0;
    out[VOICING] = o;
    out[P_LUNG] = 8.0 * o;
    out[LEVEL] = level;
    out[GATE] = o;
    out[GLOTTIS] = 0.05 + 0.1 * o;
    out[ANIMAL] = animal;
    for i in 0..N_AREAS {
        let x = i as f32 / (N_AREAS - 1) as f32;
        out[AREAS + i] = 1.5 + 2.5 * x * o + 1.0 * (1.0 - x);
    }
}

pub struct Session {
    fs: f64,
    kind: String,
    design: Design,
    end_design: Option<Design>,
    sweep: bool,
    human: Option<Engine>,
    /// pre-rendered dry signal (sfx, recordings) when there is no engine
    dry: Option<Vec<f32>>,
    use_rack: bool,
    animal: Option<Engine>,
    animal_pitch: Option<(usize, f64, f64, f64)>,
    animal_ctele: Option<CreatureTelemetry>,
    gate_env: Envelope,
    animal_gate: f64,
    rack: Rack,
    out_lim: Limiter,
    level_env: Envelope,
    tele: VoiceTelemetry,
    pub total: usize,
    pos: usize,
    out: Vec<f32>,
    frames: Vec<f32>,
    frame_every: f64,
    next_frame: f64,
    last_f0: f64,
    segments: Vec<Span>,
    words: Vec<Span>,
    transcription: String,
    block: Vec<f32>,
    ablock: Vec<f32>,
}

fn apply_source(e: &mut Engine, d: &Design, extra: &SourcePatch) {
    let s = &d.source;
    let mx = |a: f64, b: Option<f64>| b.map_or(a, |b| a.max(b));
    e.set_source(&SourcePatch {
        f0: Some(s.f0),
        pressure: Some(mx(s.pressure, extra.pressure)),
        breathiness: Some(mx(s.breathiness, extra.breathiness)),
        tension: Some(extra.tension.unwrap_or(s.tension)),
        fry: Some(mx(s.fry, extra.fry)),
        roughness: Some(mx(s.roughness, extra.roughness)),
        vibrato_depth: Some(mx(s.vibrato_depth, extra.vibrato_depth)),
        vibrato_rate: Some(extra.vibrato_rate.unwrap_or(s.vibrato_rate)),
        drift: Some(s.drift),
        brightness: Some(s.brightness),
        ..Default::default()
    });
}

/// Merge a vocal effect's own rack on top of the specimen's: the stronger setting of each wins.
fn merge_rack(base: &RackParams, extra: &RackParams) -> RackParams {
    let (a, b) = (base.to_array(), extra.to_array());
    let def = RackParams::default().to_array();
    let mut o = a;
    for i in 0..a.len() {
        if (b[i] - def[i]).abs() > 1e-6 {
            o[i] = match crate::rack::KEYS[i] {
                "shift" => clamp(a[i] + b[i], -12.0, 12.0),
                "shiftMix" | "sub" | "growl" | "drive" | "ring" | "crush" | "comb" | "flanger" | "vocoder" | "trill" | "echo" | "reverb" | "room" => a[i].max(b[i]),
                _ => b[i],
            };
        }
    }
    RackParams::from_array(&o)
}

impl Session {
    pub fn new(req: &Request, en: &EnglishG2P, input: &[f32]) -> Result<Session, String> {
        let fs = req.sample_rate.unwrap_or(48000.0).clamp(16000.0, 96000.0);
        let (spec, end_design, sweep) = match &req.morph {
            Some(m) if m.sweep => (req.specimen.clone(), Some(req.specimen.lerp(&m.to, 1.0).design()), true),
            Some(m) => (req.specimen.lerp(&m.to, m.amount), None, false),
            None => (req.specimen.clone(), None, false),
        };
        let mut design = spec.design();
        let body: BodyMix = design.body;
        let kind: String;
        let mut human: Option<Engine> = None;
        let mut dry: Option<Vec<f32>> = None;
        let mut use_rack = true;
        let mut total_s: f64;
        let mut segments = Vec::new();
        let mut words = Vec::new();
        let mut transcription = String::new();
        let mut animal_species = design.species.clone();
        let mut tight = false;
        let lead = 0.15;

        let new_engine = |d: &Design| {
            let mut e = Engine::new(fs);
            e.set_body(d.body);
            e
        };
        match &req.job {
            Job::Speech { text, lang, dialect, intonation } => {
                kind = "speech".into();
                let phrases = phrases_for(text, lang, dialect.as_deref(), en);
                if phrases.is_empty() {
                    return Err("nothing to say".into());
                }
                transcription = transcribe(&phrases);
                let plan = planner::plan_phrases(&to_inputs(&phrases, intonation.as_deref()), &PlanOptions { body, t0: lead, rate: Some(design.rate as f64), f0: Some(design.source.f0), ..Default::default() });
                let mut e = new_engine(&design);
                apply_source(&mut e, &design, &SourcePatch::default());
                e.schedule(&plan.gestures, 0.0, true);
                words = word_spans(&phrases, &plan);
                segments = plan.segments.iter().map(|s| Span { text: s.ipa.clone(), t0: s.t0, t1: s.t1 }).collect();
                total_s = plan.end + 0.45;
                human = Some(e);
            }
            Job::Song { notes, lyrics, lang, bpm, vibrato } => {
                kind = "song".into();
                let mut syl = syllables_for(lyrics, lang, en);
                if syl.is_empty() || notes.is_empty() {
                    return Err("a song needs notes and lyrics".into());
                }
                // more notes than syllables: the extra notes continue the last vowel (melisma)
                let mut sung = Vec::new();
                let transpose = 12.0 * libm::log2(design.source.f0_mul);
                for (i, n) in notes.iter().enumerate() {
                    let s = if i < syl.len() {
                        syl[i].clone()
                    } else {
                        let mut m = syl[syl.len() - 1].clone();
                        m.melisma = Some(true);
                        m.onset.clear();
                        m
                    };
                    sung.push(SungNote { midi: clamp((n.midi + transpose) as f32, 24.0, 96.0) as f64, beats: n.beats.max(0.125), syl: s });
                }
                syl.truncate(notes.len());
                if let Some(last) = sung.last_mut() {
                    last.syl.phrase_end = true;
                    last.syl.word_end = true;
                }
                let plan = plan_song(&sung, &SongOptions { body, bpm: bpm.clamp(30.0, 260.0), t0: lead + 0.2, vibrato: *vibrato });
                let mut e = new_engine(&design);
                apply_source(&mut e, &design, &SourcePatch::default());
                e.schedule(&plan.gestures, 0.0, true);
                segments = plan.segments.iter().map(|s| Span { text: s.ipa.clone(), t0: s.t0, t1: s.t1 }).collect();
                let beat = 60.0 / bpm.clamp(30.0, 260.0);
                let mut t = lead + 0.2;
                for n in &sung {
                    words.push(Span { text: n.syl.text.clone(), t0: t, t1: t + n.beats * beat });
                    t += n.beats * beat;
                }
                transcription = sung.iter().map(|n| n.syl.text.clone()).collect::<Vec<_>>().join(" ");
                total_s = plan.end + 0.6;
                human = Some(e);
            }
            Job::Beat { pattern, bpm, swing, bars } => {
                kind = "beat".into();
                let steps = parse_beat(pattern);
                if !steps.iter().any(Option::is_some) {
                    return Err("the pattern has no sounds".into());
                }
                let mut e = new_engine(&design);
                e.set_artic(&beat_ready(body), None);
                e.set_source(&SourcePatch { f0: Some(clamp((100.0 * design.source.f0_mul) as f32, 50.0, 400.0) as f64), voiced: Some(true), pressure: Some(8.0), ..Default::default() });
                e.set_gate(0.0);
                e.set_beat_steps(&steps);
                e.set_beat_tempo(Some(bpm.clamp(40.0, 220.0)), Some(swing.clamp(0.0, 0.75)));
                e.set_beat_playing(true);
                let bars = if *bars > 0.0 { bars.clamp(1.0, 16.0) } else { 2.0 };
                total_s = chimera::control::beat_player::BeatPlayer::HORIZON + bars * steps.len() as f64 * e.beat().step_dur() + 0.4;
                transcription = pattern.clone();
                // the beat stays rhythmic: no animal layer, and the rack keeps its time effects short
                animal_species = "none".into();
                human = Some(e);
            }
            Job::Call { species, call, pitch } => {
                kind = "call".into();
                let def = creature_by_id(species).ok_or_else(|| format!("no creature {species}"))?;
                let ci = def.call_index(call).ok_or_else(|| format!("{species} has no call {call}"))?;
                let mut e = Engine::new(fs);
                e.set_creature(Some(def), &[]);
                e.play_call(ci, *pitch, Some(1.0));
                let keys = &def.calls[ci].keys;
                total_s = keys.last().map_or(1.0, |k| k.t) + 0.8;
                transcription = def.calls[ci].name.to_string();
                animal_species = "none".into();
                // the creature is the voice here: the specimen's pitch shifter would only blur it
                design.rack.shift_mix = 0.0;
                human = Some(e);
            }
            Job::Vocal { vocal, seed } => {
                kind = "vocal".into();
                let vp = vocal_plan(vocal, *seed, chimera::engine::default_f0(body) * design.source.f0_mul);
                let mut plan = planner::plan_utterance(&vp.segments, &PlanOptions { body, t0: lead, f0: Some(design.source.f0), intonation: Some(Intonation::Flat), ..Default::default() });
                if let Some(p) = &vp.pulses {
                    add_pulses(&mut plan, p);
                }
                let mut e = new_engine(&design);
                apply_source(&mut e, &design, &vp.source);
                e.schedule(&plan.gestures, 0.0, true);
                if let Some(r) = vp.rack {
                    design.rack = merge_rack(&design.rack, &r);
                }
                // fricatives and creaky groans come out quiet, and quieter still from a smaller
                // airway: lift them to the level of the voiced effects
                let small = body.child + body.female * (1.0 - body.child);
                design.rack.gain_db = clamp(
                    design.rack.gain_db
                        + match vocal.as_str() {
                            "hiss" => 13.0 + 12.0 * small as f32,
                            "groan" => 5.0 + 4.0 * small as f32,
                            _ => 0.0,
                        },
                    -24.0,
                    24.0,
                );
                if vp.pulses.is_some() {
                    // laughter lives in its gaps: keep the specimen's timbre but not the long
                    // tails and the compression that would fill them
                    design.rack.reverb = design.rack.reverb.min(0.3);
                    design.rack.echo = design.rack.echo.min(0.08);
                    design.rack.drive *= 0.5;
                    tight = true;
                }
                segments = plan.segments.iter().map(|s| Span { text: s.ipa.clone(), t0: s.t0, t1: s.t1 }).collect();
                transcription = VOCALS.iter().find(|v| v.0 == vocal).map_or(vocal.clone(), |v| v.1.to_string());
                total_s = plan.end + 0.9;
                human = Some(e);
            }
            Job::Sfx { params, dna } => {
                kind = "sfx".into();
                let pcm = sfx::render(params, fs as f32);
                total_s = pcm.len() as f64 / fs + if *dna { 0.5 } else { 0.0 };
                use_rack = *dna;
                if !dna {
                    animal_species = "none".into();
                }
                dry = Some(pcm);
            }
            Job::Process { sample_rate } => {
                kind = "process".into();
                if input.is_empty() {
                    return Err("no clip to process".into());
                }
                let from = sample_rate.unwrap_or(fs) as u32;
                let pcm = crate::wav::resample(input, from, fs as u32);
                // a recorded voice cannot change its folds: the shifter does the whole pitch change
                design.rack.shift = clamp(design.pitch_semis, -12.0, 12.0);
                design.rack.shift_mix = if design.rack.shift.abs() > 0.05 { 1.0 } else { 0.0 };
                total_s = pcm.len() as f64 / fs + 0.6;
                dry = Some(pcm);
            }
        }
        if design.rack.reverb > 0.05 || design.rack.echo > 0.05 {
            total_s += 0.5;
        }
        total_s = total_s.clamp(0.2, 180.0);

        // the animal splice
        let mut animal = None;
        let mut animal_pitch = None;
        let mut animal_ctele = None;
        if design.animal_gain > 0.0 && animal_species != "none"
            && let Some(def) = creature_by_id(&animal_species)
        {
            let mut e = Engine::new(fs);
            e.set_creature(Some(def), &[]);
            e.set_gate(0.0);
            if let Some(i) = def.params.iter().position(|p| p.role == Some(ParamRole::Pitch)) {
                let p = &def.params[i];
                animal_pitch = Some((i, p.min, p.max, p.default / 130.0));
            }
            animal_ctele = e.creature().map(|c| c.new_telemetry());
            animal = Some(e);
        }

        let mut rack = Rack::new(fs as f32);
        rack.set(&design.rack);
        rack.snap();
        let total = (total_s * fs) as usize;
        let mut tele = VoiceTelemetry::default();
        if let Some(e) = human.as_mut() {
            e.telemetry(&mut tele);
        }
        Ok(Session {
            fs,
            kind,
            end_design,
            sweep,
            design,
            human,
            dry,
            use_rack,
            animal,
            animal_pitch,
            animal_ctele,
            // the animal follows the breath; tight for laughter so it pulses with every "ha"
            gate_env: if tight { Envelope::new(0.004, 0.035, fs as f32) } else { Envelope::new(0.01, 0.12, fs as f32) },
            animal_gate: 0.0,
            rack,
            out_lim: Limiter::new(fs as f32),
            level_env: Envelope::new(0.005, 0.1, fs as f32),
            tele,
            total,
            pos: 0,
            out: Vec::with_capacity(total),
            frames: Vec::with_capacity(((total_s * FRAME_RATE) as usize + 2) * FRAME_STRIDE),
            frame_every: fs / FRAME_RATE,
            next_frame: 0.0,
            last_f0: 120.0,
            segments,
            words,
            transcription,
            block: vec![0.0; 128],
            ablock: vec![0.0; 128],
        })
    }

    pub fn progress(&self) -> (usize, usize) {
        (self.pos, self.total)
    }

    /// Copies of what has been rendered since (`from_sample`, `from_frame`), for streaming
    /// playback while the render continues.
    pub fn take(&self, from_sample: usize, from_frame: usize) -> (Vec<f32>, Vec<f32>) {
        let a = from_sample.min(self.out.len());
        let f = (from_frame * FRAME_STRIDE).min(self.frames.len());
        (self.out[a..].to_vec(), self.frames[f..].to_vec())
    }

    pub fn done(&self) -> bool {
        self.pos >= self.total
    }

    /// Render up to `max` more samples. Returns true when finished.
    pub fn step(&mut self, max: usize) -> bool {
        let end = (self.pos + max).min(self.total);
        let is_creature_voice = self.kind == "call";
        while self.pos < end {
            let n = 128.min(end - self.pos);
            let block = &mut self.block[..n];
            // the dry voice
            if let Some(e) = self.human.as_mut() {
                e.render(block);
            } else if let Some(d) = &self.dry {
                for (i, x) in block.iter_mut().enumerate() {
                    *x = d.get(self.pos + i).copied().unwrap_or(0.0);
                }
            } else {
                block.fill(0.0);
            }
            // the animal follows the dry voice's breath
            let mut env_peak = 0.0f32;
            for x in block.iter() {
                env_peak = env_peak.max(self.gate_env.run(*x));
            }
            let mut ag = 0.0f32;
            if let Some(a) = self.animal.as_mut() {
                let g = clamp((env_peak - 0.012) / 0.06, 0.0, 1.0) as f64;
                if (g - self.animal_gate).abs() > 0.01 {
                    self.animal_gate = g;
                    a.set_gate(g);
                }
                let ab = &mut self.ablock[..n];
                a.render(ab);
                ag = self.design.animal_gain;
            }
            // morph sweep: the rack glides from the specimen to the target
            if self.sweep
                && let Some(end_d) = &self.end_design
            {
                let t = self.pos as f32 / self.total.max(1) as f32;
                let mut target = end_d.rack;
                target.shift = clamp(self.design.rack.shift + (end_d.pitch_semis - self.design.pitch_semis), -12.0, 12.0);
                target.shift_mix = 1.0;
                let p = self.design.rack.lerp(&target, clamp(t * 1.25, 0.0, 1.0));
                self.rack.set(&p);
                if self.pos % 4096 < 128
                    && let Some(e) = self.human.as_mut()
                {
                    let src = |a: f64, b: f64| Some(a + (b - a) * t as f64);
                    let (s0, s1) = (&self.design.source, &end_d.source);
                    e.set_source(&SourcePatch { fry: src(s0.fry, s1.fry), roughness: src(s0.roughness, s1.roughness), tension: src(s0.tension, s1.tension), breathiness: src(s0.breathiness, s1.breathiness), ..Default::default() });
                }
            }
            if self.use_rack {
                self.rack.process(block);
            }
            for i in 0..n {
                let mut y = block[i];
                if ag > 0.0 {
                    y = y * (1.0 - 0.3 * ag) + self.ablock[i] * ag * 1.2;
                }
                let y = self.out_lim.run(y);
                self.level_env.run(y);
                self.out.push(y);
            }
            self.pos += n;
            // telemetry frames at 60 fps
            while (self.pos as f64) >= self.next_frame {
                self.next_frame += self.frame_every;
                let mut f = [0.0f32; FRAME_STRIDE];
                let level = self.level_env.y;
                match self.human.as_mut() {
                    Some(e) if !is_creature_voice => {
                        e.telemetry(&mut self.tele);
                        frame_from_telemetry(&self.tele, level, &mut f);
                        if self.tele.voicing > 0.3 && self.tele.f0 > 30.0 {
                            self.last_f0 = self.tele.f0;
                        }
                    }
                    _ => frame_from_level(level, if is_creature_voice { 1.0 } else { 0.0 }, &mut f),
                }
                f[frame::ANIMAL] = f[frame::ANIMAL].max(self.animal_gate as f32 * ag);
                // the animal sings the human's melody
                if let (Some(a), Some((i, lo, hi, ratio))) = (self.animal.as_mut(), self.animal_pitch) {
                    let p = (self.last_f0 * ratio * 130.0 / 120.0).clamp(lo, hi);
                    a.set_creature_params(&[(i, p)]);
                    if let Some(ct) = self.animal_ctele.as_mut() {
                        a.creature_telemetry(ct);
                    }
                }
                self.frames.extend_from_slice(&f);
            }
        }
        self.done()
    }

    /// Finish: (pcm, frames, meta).
    pub fn finish(mut self) -> (Vec<f32>, Vec<f32>, Meta) {
        while !self.done() {
            self.step(1 << 16);
        }
        // fade the last 15 ms (the tail of reverbs)
        let n = self.out.len();
        let m = ((0.015 * self.fs) as usize).min(n);
        for i in 0..m {
            self.out[n - 1 - i] *= i as f32 / m as f32;
        }
        let frames = self.frames.len() / FRAME_STRIDE;
        let meta = Meta {
            sample_rate: self.fs,
            samples: n,
            frames,
            frame_rate: FRAME_RATE,
            stride: FRAME_STRIDE,
            segments: self.segments,
            words: self.words,
            transcription: self.transcription,
            design: self.design,
            kind: self.kind,
        };
        (self.out, self.frames, meta)
    }
}

/// Render a request in one go (tests, small jobs).
pub fn render(req: &Request, en: &EnglishG2P, input: &[f32]) -> Result<(Vec<f32>, Vec<f32>, Meta), String> {
    Ok(Session::new(req, en, input)?.finish())
}
