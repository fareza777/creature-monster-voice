//! Creature DNA: five strands blended into one specimen. A specimen maps to the physical voice's
//! source settings (what the vocal folds and lungs do), a pitch/formant plan, and rack settings.

use crate::dsp::clamp;
use crate::rack::RackParams;
use chimera::anatomy::human::BodyMix;
use serde::{Deserialize, Serialize};

/// Animal airways from the engine that can be spliced in.
pub const SPECIES: &[&str] = &["none", "songbird", "seal", "alligator", "elephant"];

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Specimen {
    pub monster: f32,
    pub alien: f32,
    pub robot: f32,
    pub human: f32,
    pub animal: f32,
    /// engine creature id for the animal splice ("none" for the trill effect only)
    pub species: String,
    /// body blend (0 male … 1 female, 0 adult … 1 child)
    pub female: f32,
    pub child: f32,
    /// user pitch offset (semitones)
    pub pitch: f32,
    /// user size offset (formant semitones, negative = bigger creature)
    pub size: f32,
    /// extra rasp 0..1
    pub rasp: f32,
    /// extra breathiness 0..1
    pub breath: f32,
    /// rack amount 0..1
    pub intensity: f32,
    /// reverb override (< 0: from DNA)
    pub reverb: f32,
    /// echo amount 0..1
    pub echo: f32,
    /// speaking rate multiplier
    pub rate: f32,
}

impl Default for Specimen {
    fn default() -> Self {
        Specimen {
            monster: 0.0,
            alien: 0.0,
            robot: 0.0,
            human: 1.0,
            animal: 0.0,
            species: "none".into(),
            female: 0.0,
            child: 0.0,
            pitch: 0.0,
            size: 0.0,
            rasp: 0.0,
            breath: 0.0,
            intensity: 1.0,
            reverb: -1.0,
            echo: 0.0,
            rate: 1.0,
        }
    }
}

/// Normalised DNA shares (sum 1).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Shares {
    pub m: f32,
    pub a: f32,
    pub r: f32,
    pub h: f32,
    pub n: f32,
}

/// The voice source a specimen asks for (engine `SourcePatch` fields).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSettings {
    pub f0: f64,
    /// multiplier on any planned pitch (speech baseline, sung notes)
    pub f0_mul: f64,
    pub pressure: f64,
    pub breathiness: f64,
    pub tension: f64,
    pub fry: f64,
    pub roughness: f64,
    pub vibrato_depth: f64,
    pub vibrato_rate: f64,
    pub drift: f64,
    pub brightness: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Design {
    pub shares: Shares,
    pub body: BodyMix,
    pub source: VoiceSettings,
    pub rack: RackParams,
    /// total pitch change (semitones) and the part of it done by the formant shifter
    pub pitch_semis: f32,
    pub formant_semis: f32,
    pub species: String,
    /// animal layer gain
    pub animal_gain: f32,
    pub rate: f32,
}

impl Specimen {
    pub fn shares(&self) -> Shares {
        let f = |x: f32| if x.is_finite() { x.max(0.0) } else { 0.0 };
        let (m, a, r, h, n) = (f(self.monster), f(self.alien), f(self.robot), f(self.human), f(self.animal));
        let s = m + a + r + h + n;
        if s <= 1e-6 {
            return Shares { m: 0.0, a: 0.0, r: 0.0, h: 1.0, n: 0.0 };
        }
        Shares { m: m / s, a: a / s, r: r / s, h: h / s, n: n / s }
    }

    pub fn body(&self) -> BodyMix {
        BodyMix::new(self.female as f64, self.child as f64)
    }

    /// Interpolate two specimens (A↔B morph). The species switches at the midpoint, but its
    /// layer gain follows the blended animal share, so the switch is inaudible when one side has none.
    pub fn lerp(&self, b: &Specimen, t: f32) -> Specimen {
        let t = clamp(t, 0.0, 1.0);
        let l = |x: f32, y: f32| x + (y - x) * t;
        let (sa, sb) = (self.shares(), b.shares());
        let species = if self.species == "none" { b.species.clone() } else if b.species == "none" || t < 0.5 { self.species.clone() } else { b.species.clone() };
        Specimen {
            monster: l(sa.m, sb.m),
            alien: l(sa.a, sb.a),
            robot: l(sa.r, sb.r),
            human: l(sa.h, sb.h),
            animal: l(sa.n, sb.n),
            species,
            female: l(self.female, b.female),
            child: l(self.child, b.child),
            pitch: l(self.pitch, b.pitch),
            size: l(self.size, b.size),
            rasp: l(self.rasp, b.rasp),
            breath: l(self.breath, b.breath),
            intensity: l(self.intensity, b.intensity),
            reverb: if self.reverb < 0.0 && b.reverb < 0.0 { -1.0 } else { l(self.reverb.max(0.0), b.reverb.max(0.0)) },
            echo: l(self.echo, b.echo),
            rate: l(self.rate, b.rate),
        }
    }

    /// Everything the voice, the rack and the splice need.
    pub fn design(&self) -> Design {
        let s = self.shares();
        let Shares { m, a, r, n, .. } = s;
        let body = self.body();
        let base_f0 = chimera::engine::default_f0(body);

        let pitch_semis = -14.0 * m + 9.0 * a - 3.0 * r + 5.0 * n + self.pitch;
        let formant_semis = clamp(-7.0 * m + 5.0 * a + 2.0 * n + self.size, -12.0, 12.0);
        // the folds take the part of the pitch change the shifter does not
        let f0_mul = libm::pow(2.0, ((pitch_semis - formant_semis) / 12.0) as f64);
        let f0 = clamp((base_f0 * f0_mul) as f32, 45.0, 900.0) as f64;

        let source = VoiceSettings {
            f0,
            f0_mul,
            pressure: clamp(8.0 + 5.0 * m + 2.0 * n + 1.0 * a, 4.0, 16.0) as f64,
            breathiness: clamp(0.12 + 0.35 * self.breath + 0.15 * n + 0.1 * a, 0.0, 1.0) as f64,
            tension: clamp(0.5 + 0.35 * r + 0.25 * a - 0.2 * m, 0.0, 1.0) as f64,
            fry: clamp(0.75 * m + 0.2 * n + 0.5 * self.rasp, 0.0, 1.0) as f64,
            roughness: clamp(0.1 + 0.7 * m + 0.35 * n + 0.5 * self.rasp - 0.1 * r, 0.0, 1.0) as f64,
            vibrato_depth: clamp(60.0 * n + 25.0 * a, 0.0, 100.0) as f64 * (1.0 - r as f64),
            vibrato_rate: (5.5 + 4.0 * n + 2.0 * a) as f64,
            drift: clamp(5.0 * (1.0 - r) + 12.0 * m, 0.0, 30.0) as f64,
            brightness: clamp(0.25 + 0.4 * r + 0.2 * a - 0.1 * m, 0.0, 1.0) as f64,
        };

        let ra = r + a;
        let rack = RackParams {
            shift: formant_semis,
            shift_mix: if formant_semis.abs() > 0.05 { 1.0 } else { 0.0 },
            sub: clamp(0.65 * m, 0.0, 1.0),
            growl: clamp(0.7 * m + 0.3 * self.rasp, 0.0, 1.0),
            growl_rate: 28.0 + 30.0 * n + 10.0 * a,
            drive: clamp(0.25 * m + 0.3 * r, 0.0, 1.0),
            ring: clamp(0.55 * r + 0.35 * a, 0.0, 1.0),
            ring_freq: if ra > 1e-4 { (55.0 * r + 380.0 * a) / ra } else { 60.0 },
            ring_lfo: if ra > 1e-4 { a / ra } else { 0.0 },
            crush: clamp(0.6 * r, 0.0, 1.0),
            bits: 16.0 - 9.0 * r,
            downsample: 1.0 + 5.0 * r,
            comb: clamp(0.7 * r, 0.0, 0.95),
            comb_ms: 4.5,
            flanger: clamp(0.75 * a, 0.0, 1.0),
            flanger_rate: 0.35,
            vocoder: if r > 0.55 { clamp((r - 0.55) / 0.45, 0.0, 1.0) } else { 0.0 },
            vocoder_pitch: clamp((f0 * libm::pow(2.0, formant_semis as f64 / 12.0)) as f32, 40.0, 800.0),
            trill: clamp(0.6 * n, 0.0, 1.0),
            trill_rate: 7.0 + 5.0 * n,
            low_cut: 50.0 + 120.0 * a,
            tone: clamp(0.5 * a + 0.3 * r - 0.5 * m, -1.0, 1.0),
            echo: clamp(self.echo, 0.0, 1.0),
            echo_ms: 240.0 + 200.0 * m,
            echo_fb: 0.35,
            reverb: if self.reverb >= 0.0 { clamp(self.reverb, 0.0, 1.0) } else { clamp(0.12 + 0.3 * m + 0.35 * a, 0.0, 1.0) },
            room: clamp(0.5 + 0.4 * m, 0.0, 1.0),
            gain_db: 0.0,
            mix: clamp(self.intensity, 0.0, 1.0),
        }
        .clamped();

        let species = if SPECIES.contains(&self.species.as_str()) { self.species.clone() } else { "none".into() };
        let animal_gain = if species == "none" { 0.0 } else { clamp(0.9 * n * 1.6, 0.0, 0.9) };
        Design { shares: s, body, source, rack, pitch_semis, formant_semis, species, animal_gain, rate: clamp(if self.rate > 0.0 { self.rate } else { 1.0 }, 0.4, 2.5) }
    }
}
