//! JSON dispatcher for the lab (`{"fn": name, ...}` → JSON). Binary data travels through the
//! state's buffers: `input` (f32 the caller fills), `input_u8` (bytes), and the outputs `f32_out`
//! (index 0: pcm/result, 1: telemetry frames) and `u8_out` (encoded files).

use crate::dna::{SPECIES, Specimen};
use crate::edit::{self, EditOp};
use crate::rack::{KEYS, RANGES};
use crate::render::{self, FRAME_RATE, FRAME_STRIDE, LANGUAGES, Request, Session, VOCALS};
use crate::sfx::{self, CATEGORIES, SfxParams};
use crate::wav;
use chimera::phonetics::english::EnglishG2P;
use serde_json::{Value, json};

#[derive(Default)]
pub struct LabState {
    pub en: EnglishG2P,
    pub session: Option<Session>,
    pub input: Vec<f32>,
    pub input_u8: Vec<u8>,
    pub f32_out: [Vec<f32>; 2],
    pub u8_out: Vec<u8>,
}

type Res = Result<Value, String>;

fn arg<T: serde::de::DeserializeOwned>(req: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(req.get(key).cloned().unwrap_or(Value::Null)).map_err(|e| format!("{key}: {e}"))
}

fn opt<T: serde::de::DeserializeOwned>(req: &Value, key: &str) -> Result<Option<T>, String> {
    match req.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => serde_json::from_value(v.clone()).map(Some).map_err(|e| format!("{key}: {e}")),
    }
}

fn to_json<T: serde::Serialize>(v: &T) -> Res {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

pub fn catalog() -> Value {
    json!({
        "rackKeys": KEYS,
        "rackRanges": RANGES,
        "frameStride": FRAME_STRIDE,
        "frameRate": FRAME_RATE,
        "species": SPECIES,
        "sfxCategories": CATEGORIES.iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
        "vocals": VOCALS.iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
        "languages": LANGUAGES.iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
        "dialects": ["guttural", "liquid", "insectoid"],
        "version": env!("CARGO_PKG_VERSION"),
    })
}

pub fn dispatch(st: &mut LabState, req: &Value) -> Res {
    let name = req.get("fn").and_then(Value::as_str).ok_or("missing fn")?;
    match name {
        "catalog" => Ok(catalog()),
        "design" => to_json(&arg::<Specimen>(req, "specimen")?.design()),
        "morphDesign" => {
            let a: Specimen = arg(req, "a")?;
            let b: Specimen = arg(req, "b")?;
            let t: f32 = arg(req, "t")?;
            to_json(&a.lerp(&b, t).design())
        }
        "loadDict" => {
            st.en.load_dict(&arg::<String>(req, "text")?);
            Ok(json!(true))
        }
        "dictLoaded" => Ok(json!(st.en.is_loaded())),
        "g2p" => {
            let text: String = arg(req, "text")?;
            let lang: String = opt(req, "lang")?.unwrap_or_else(|| "en".into());
            let dialect: Option<String> = opt(req, "dialect")?;
            let p = render::phrases_for(&text, &lang, dialect.as_deref(), &st.en);
            Ok(json!({ "transcription": render::transcribe(&p), "phrases": p.len(), "words": p.iter().map(|x| x.words.clone()).collect::<Vec<_>>() }))
        }
        // ------------------------------------------------------------ rendering
        "renderStart" => {
            let r: Request = arg(req, "request")?;
            let s = Session::new(&r, &st.en, &st.input)?;
            let (pos, total) = s.progress();
            st.session = Some(s);
            Ok(json!({ "pos": pos, "total": total }))
        }
        "renderStep" => {
            let n: usize = opt(req, "samples")?.unwrap_or(24000);
            let s = st.session.as_mut().ok_or("no render in progress")?;
            let done = s.step(n.clamp(128, 1 << 20));
            let (pos, total) = s.progress();
            Ok(json!({ "pos": pos, "total": total, "done": done }))
        }
        "renderTake" => {
            let s = st.session.as_ref().ok_or("no render in progress")?;
            let from: usize = opt(req, "fromSample")?.unwrap_or(0);
            let from_frame: usize = opt(req, "fromFrame")?.unwrap_or(0);
            let (pcm, frames) = s.take(from, from_frame);
            let n = (pcm.len(), frames.len() / FRAME_STRIDE);
            st.f32_out[0] = pcm;
            st.f32_out[1] = frames;
            Ok(json!({ "samples": n.0, "frames": n.1 }))
        }
        "renderFinish" => {
            let s = st.session.take().ok_or("no render in progress")?;
            let (pcm, frames, meta) = s.finish();
            st.f32_out[0] = pcm;
            st.f32_out[1] = frames;
            to_json(&meta)
        }
        "renderCancel" => {
            st.session = None;
            Ok(Value::Null)
        }
        // ------------------------------------------------------------ SFX
        "sfxPreset" => to_json(&sfx::preset(&arg::<String>(req, "category")?, opt(req, "seed")?.unwrap_or(1))),
        "sfxMutate" => to_json(&sfx::mutate(&arg::<SfxParams>(req, "params")?, opt(req, "amount")?.unwrap_or(0.3), opt(req, "seed")?.unwrap_or(7))),
        // ------------------------------------------------------------ clip editing (on `input`)
        "edit" => {
            let op: EditOp = arg(req, "op")?;
            let fs: f32 = opt(req, "sampleRate")?.unwrap_or(48000.0);
            st.f32_out[0] = edit::apply(&st.input, fs, &op);
            Ok(json!({ "samples": st.f32_out[0].len() }))
        }
        "waveform" => {
            let bins: usize = opt(req, "bins")?.unwrap_or(400);
            st.f32_out[0] = edit::waveform(&st.input, bins);
            Ok(json!({ "bins": st.f32_out[0].len() / 2 }))
        }
        "stats" => {
            let peak = st.input.iter().fold(0.0f32, |m, x| m.max(x.abs()));
            let rms = (st.input.iter().map(|x| x * x).sum::<f32>() / st.input.len().max(1) as f32).sqrt();
            Ok(json!({ "peak": peak, "rms": rms, "samples": st.input.len() }))
        }
        "encodeWav" => {
            let fs: u32 = opt(req, "sampleRate")?.unwrap_or(48000);
            st.u8_out = wav::encode16(&st.input, fs);
            Ok(json!({ "bytes": st.u8_out.len() }))
        }
        "decodeWav" => {
            let (pcm, fs) = wav::decode(&st.input_u8)?;
            let to: u32 = opt(req, "sampleRate")?.unwrap_or(48000);
            st.f32_out[0] = wav::resample(&pcm, fs, to);
            Ok(json!({ "samples": st.f32_out[0].len(), "sourceRate": fs }))
        }
        "resample" => {
            let from: u32 = arg(req, "from")?;
            let to: u32 = opt(req, "to")?.unwrap_or(48000);
            st.f32_out[0] = wav::resample(&st.input, from, to);
            Ok(json!({ "samples": st.f32_out[0].len() }))
        }
        _ => Err(format!("unknown fn {name}")),
    }
}
