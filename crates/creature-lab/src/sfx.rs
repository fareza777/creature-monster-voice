//! Procedural sound-effect synthesiser. One voice: oscillator (sine, square, saw, triangle,
//! noise, FM) with an exponential pitch sweep, vibrato, arpeggio jump and per-trigger pitch
//! jitter, plus a coloured-noise layer and a sub-octave; a resonant low-pass with sweep and LFO,
//! a high-pass, tremolo, drive and crusher; an attack/hold/decay envelope with punch, retrigger
//! and a "double hit"; crackle for thunder and fire; echo and reverb through the rack.
//! Each category builds its parameters from a seed, so a (category, seed) pair is a sound.

use crate::dsp::*;
use crate::rack::{RackParams, process_clip};
use libm::{expf, floorf, powf, sinf};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SfxParams {
    /// 0 sine, 1 square, 2 saw, 3 triangle, 4 noise, 5 FM
    pub wave: u8,
    pub freq: f32,
    pub freq_end: f32,
    /// sweep shape: progress^curve
    pub curve: f32,
    pub vib_depth: f32,
    pub vib_rate: f32,
    pub duty: f32,
    pub fm_ratio: f32,
    pub fm_index: f32,
    pub fm_index_end: f32,
    pub noise: f32,
    pub noise_tone: f32,
    pub sub: f32,
    pub attack: f32,
    pub hold: f32,
    pub decay: f32,
    pub punch: f32,
    pub lp: f32,
    pub lp_end: f32,
    pub res: f32,
    pub hp: f32,
    pub flt_lfo: f32,
    pub flt_lfo_rate: f32,
    /// retrigger rate (Hz, 0 none)
    pub repeat: f32,
    /// random pitch per trigger (semitones)
    pub jitter: f32,
    /// second hit this many seconds after each trigger (0 none)
    pub double: f32,
    pub arp: f32,
    pub arp_at: f32,
    pub trem_depth: f32,
    pub trem_rate: f32,
    pub crackle: f32,
    pub drive: f32,
    pub crush: f32,
    pub echo: f32,
    pub reverb: f32,
    /// total length (s); 0: attack + hold + decay
    pub length: f32,
    pub gain: f32,
    pub seed: u32,
}

impl Default for SfxParams {
    fn default() -> Self {
        SfxParams {
            wave: 1,
            freq: 440.0,
            freq_end: 440.0,
            curve: 1.0,
            vib_depth: 0.0,
            vib_rate: 6.0,
            duty: 0.5,
            fm_ratio: 2.0,
            fm_index: 0.0,
            fm_index_end: 0.0,
            noise: 0.0,
            noise_tone: 4000.0,
            sub: 0.0,
            attack: 0.005,
            hold: 0.1,
            decay: 0.3,
            punch: 0.0,
            lp: 18000.0,
            lp_end: 18000.0,
            res: 0.7,
            hp: 20.0,
            flt_lfo: 0.0,
            flt_lfo_rate: 0.5,
            repeat: 0.0,
            jitter: 0.0,
            double: 0.0,
            arp: 0.0,
            arp_at: 1.0,
            trem_depth: 0.0,
            trem_rate: 8.0,
            crackle: 0.0,
            drive: 0.0,
            crush: 0.0,
            echo: 0.0,
            reverb: 0.0,
            length: 0.0,
            gain: 0.0,
            seed: 1,
        }
    }
}

/// Synth categories (id, display name).
pub const CATEGORIES: &[(&str, &str)] = &[
    ("laser", "Laser Blaster"),
    ("zap", "Electro Zap"),
    ("explosion", "Explosion"),
    ("powerup", "Power-Up"),
    ("portal", "Portal Warp"),
    ("alarm", "Lab Alarm"),
    ("robot_beep", "Robot Chirp"),
    ("ghost_wail", "Ghost Wail"),
    ("heartbeat", "Heartbeat"),
    ("thunder", "Thunder"),
    ("slime", "Slime Squelch"),
    ("creak", "Haunted Creak"),
    ("stomp", "Giant Stomp"),
    ("wind", "Graveyard Wind"),
    ("bubble", "Cauldron Bubbles"),
    ("alien_chatter", "Alien Chatter"),
    ("magic", "Spell Cast"),
    ("ufo", "UFO Hover"),
];

/// Parameters for a category, varied by the seed.
pub fn preset(category: &str, seed: u32) -> SfxParams {
    let mut r = Rng::new(seed.wrapping_mul(2_654_435_761).wrapping_add(17));
    let mut p = SfxParams { seed, ..Default::default() };
    match category {
        "laser" => {
            p.wave = *r.pick(&[1u8, 2, 5]);
            p.freq = r.range(900.0, 2400.0);
            p.freq_end = r.range(80.0, 300.0);
            p.curve = r.range(0.4, 0.8);
            p.duty = r.range(0.2, 0.5);
            p.fm_ratio = r.range(1.5, 3.5);
            p.fm_index = r.range(1.0, 4.0);
            p.attack = 0.002;
            p.hold = r.range(0.02, 0.08);
            p.decay = r.range(0.12, 0.3);
            p.punch = r.range(0.2, 0.6);
            p.lp = 9000.0;
            p.lp_end = 2500.0;
            p.echo = r.range(0.0, 0.25);
        }
        "zap" => {
            p.wave = 2;
            p.freq = r.range(200.0, 900.0);
            p.freq_end = p.freq * r.range(0.6, 1.4);
            p.vib_depth = r.range(4.0, 12.0);
            p.vib_rate = r.range(30.0, 70.0);
            p.noise = r.range(0.3, 0.6);
            p.noise_tone = 9000.0;
            p.attack = 0.001;
            p.hold = r.range(0.05, 0.2);
            p.decay = r.range(0.1, 0.3);
            p.repeat = r.range(0.0, 1.0) * 18.0;
            p.jitter = 6.0;
            p.crush = r.range(0.1, 0.4);
            p.hp = 400.0;
        }
        "explosion" => {
            p.wave = 4;
            p.noise = 1.0;
            p.noise_tone = r.range(1500.0, 5000.0);
            p.sub = r.range(0.5, 0.9);
            p.freq = r.range(60.0, 90.0);
            p.freq_end = 30.0;
            p.attack = 0.002;
            p.hold = r.range(0.05, 0.15);
            p.decay = r.range(0.9, 1.8);
            p.punch = 1.0;
            p.lp = r.range(4000.0, 9000.0);
            p.lp_end = r.range(200.0, 500.0);
            p.curve = 0.5;
            p.crackle = r.range(0.2, 0.5);
            p.drive = r.range(0.3, 0.6);
            p.reverb = r.range(0.2, 0.4);
        }
        "powerup" => {
            p.wave = *r.pick(&[1u8, 3]);
            p.freq = r.range(200.0, 400.0);
            p.freq_end = p.freq * r.range(2.5, 4.0);
            p.curve = 1.4;
            p.repeat = r.range(8.0, 14.0);
            p.attack = 0.003;
            p.hold = 0.04;
            p.decay = 0.06;
            p.length = r.range(0.5, 0.9);
            p.arp = 12.0;
            p.arp_at = 0.6;
            p.echo = 0.2;
        }
        "portal" => {
            p.wave = 5;
            p.freq = r.range(80.0, 200.0);
            p.freq_end = r.range(600.0, 1400.0);
            p.curve = 2.0;
            p.fm_ratio = r.range(0.49, 0.51);
            p.fm_index = 0.5;
            p.fm_index_end = r.range(4.0, 9.0);
            p.attack = 0.3;
            p.hold = 0.6;
            p.decay = 0.7;
            p.flt_lfo = 1.5;
            p.flt_lfo_rate = r.range(3.0, 7.0);
            p.lp = 3000.0;
            p.lp_end = 6000.0;
            p.res = 4.0;
            p.trem_depth = 0.3;
            p.trem_rate = r.range(6.0, 14.0);
            p.reverb = 0.45;
        }
        "alarm" => {
            p.wave = *r.pick(&[1u8, 2]);
            p.freq = r.range(600.0, 900.0);
            p.freq_end = p.freq * 1.5;
            p.repeat = r.range(1.5, 3.0);
            p.attack = 0.005;
            p.hold = 0.18;
            p.decay = 0.1;
            p.length = 2.0;
            p.lp = 5000.0;
            p.drive = 0.3;
            p.reverb = 0.25;
        }
        "robot_beep" => {
            p.wave = 1;
            p.duty = r.range(0.15, 0.5);
            p.freq = r.range(500.0, 1500.0);
            p.freq_end = p.freq;
            p.repeat = r.range(6.0, 12.0);
            p.jitter = r.range(5.0, 12.0);
            p.attack = 0.002;
            p.hold = 0.03;
            p.decay = 0.03;
            p.length = r.range(0.5, 1.2);
            p.crush = r.range(0.2, 0.6);
        }
        "ghost_wail" => {
            p.wave = 0;
            p.freq = r.range(380.0, 600.0);
            p.freq_end = p.freq * r.range(0.45, 0.7);
            p.curve = 1.6;
            p.vib_depth = r.range(0.8, 2.0);
            p.vib_rate = r.range(4.0, 6.5);
            p.noise = 0.25;
            p.noise_tone = 2500.0;
            p.attack = r.range(0.3, 0.6);
            p.hold = r.range(0.6, 1.2);
            p.decay = r.range(0.8, 1.4);
            p.trem_depth = 0.25;
            p.trem_rate = 3.0;
            p.reverb = 0.6;
            p.echo = 0.3;
        }
        "heartbeat" => {
            p.wave = 0;
            p.freq = r.range(55.0, 75.0);
            p.freq_end = 38.0;
            p.attack = 0.004;
            p.hold = 0.02;
            p.decay = 0.16;
            p.punch = 0.6;
            p.repeat = r.range(1.0, 1.6);
            p.double = 0.28;
            p.length = 3.0;
            p.lp = 600.0;
            p.lp_end = 400.0;
            p.drive = 0.4;
        }
        "thunder" => {
            p.wave = 4;
            p.noise = 1.0;
            p.noise_tone = 1200.0;
            p.sub = 0.5;
            p.freq = 50.0;
            p.freq_end = 30.0;
            p.attack = r.range(0.01, 0.15);
            p.hold = r.range(0.3, 0.6);
            p.decay = r.range(1.8, 3.0);
            p.lp = r.range(2000.0, 4000.0);
            p.lp_end = 180.0;
            p.crackle = r.range(0.4, 0.8);
            p.reverb = 0.5;
            p.drive = 0.25;
        }
        "slime" => {
            p.wave = 5;
            p.freq = r.range(90.0, 180.0);
            p.freq_end = p.freq * r.range(0.4, 2.0);
            p.fm_ratio = r.range(0.5, 1.5);
            p.fm_index = r.range(2.0, 6.0);
            p.fm_index_end = 0.5;
            p.repeat = r.range(5.0, 11.0);
            p.jitter = r.range(4.0, 9.0);
            p.attack = 0.01;
            p.hold = 0.03;
            p.decay = 0.08;
            p.length = r.range(0.7, 1.3);
            p.lp = 1400.0;
            p.res = 6.0;
        }
        "creak" => {
            p.wave = 2;
            p.freq = r.range(28.0, 45.0);
            p.freq_end = p.freq * r.range(1.3, 2.2);
            p.vib_depth = r.range(2.0, 5.0);
            p.vib_rate = r.range(1.5, 4.0);
            p.attack = 0.15;
            p.hold = r.range(0.6, 1.2);
            p.decay = 0.4;
            p.lp = 2200.0;
            p.lp_end = 1500.0;
            p.res = r.range(6.0, 10.0);
            p.hp = 120.0;
            p.drive = 0.4;
            p.reverb = 0.3;
        }
        "stomp" => {
            p.wave = 0;
            p.freq = r.range(70.0, 110.0);
            p.freq_end = 28.0;
            p.curve = 0.5;
            p.noise = 0.5;
            p.noise_tone = 900.0;
            p.attack = 0.002;
            p.hold = 0.03;
            p.decay = r.range(0.4, 0.8);
            p.punch = 1.0;
            p.repeat = r.range(1.2, 1.8);
            p.length = r.range(1.6, 2.6);
            p.drive = 0.5;
            p.reverb = 0.35;
        }
        "wind" => {
            p.wave = 4;
            p.noise = 1.0;
            p.noise_tone = 6000.0;
            p.attack = 0.8;
            p.hold = r.range(1.5, 2.5);
            p.decay = 1.2;
            p.lp = r.range(500.0, 900.0);
            p.lp_end = r.range(700.0, 1300.0);
            p.res = r.range(5.0, 9.0);
            p.flt_lfo = r.range(0.8, 1.6);
            p.flt_lfo_rate = r.range(0.2, 0.5);
            p.trem_depth = 0.4;
            p.trem_rate = 0.4;
            p.reverb = 0.3;
        }
        "bubble" => {
            p.wave = 0;
            p.freq = r.range(250.0, 500.0);
            p.freq_end = p.freq * 2.5;
            p.curve = 0.6;
            p.repeat = r.range(4.0, 9.0);
            p.jitter = r.range(5.0, 10.0);
            p.attack = 0.002;
            p.hold = 0.01;
            p.decay = 0.06;
            p.length = r.range(1.2, 2.2);
            p.lp = 3000.0;
            p.reverb = 0.25;
        }
        "alien_chatter" => {
            p.wave = 5;
            p.freq = r.range(300.0, 800.0);
            p.freq_end = p.freq * r.range(0.6, 1.6);
            p.fm_ratio = r.range(1.4, 3.1);
            p.fm_index = r.range(1.0, 5.0);
            p.fm_index_end = r.range(0.0, 3.0);
            p.repeat = r.range(7.0, 13.0);
            p.jitter = r.range(6.0, 14.0);
            p.vib_depth = 1.0;
            p.vib_rate = 18.0;
            p.attack = 0.005;
            p.hold = 0.04;
            p.decay = 0.05;
            p.length = r.range(1.0, 1.8);
            p.trem_depth = 0.3;
            p.trem_rate = 25.0;
        }
        "magic" => {
            p.wave = 3;
            p.freq = r.range(700.0, 1200.0);
            p.freq_end = p.freq * r.range(1.5, 2.5);
            p.repeat = r.range(14.0, 24.0);
            p.jitter = 12.0;
            p.attack = 0.002;
            p.hold = 0.01;
            p.decay = 0.05;
            p.length = r.range(0.8, 1.4);
            p.trem_depth = 0.5;
            p.trem_rate = 3.0;
            p.echo = 0.35;
            p.reverb = 0.45;
        }
        "ufo" => {
            p.wave = 0;
            p.freq = r.range(300.0, 600.0);
            p.freq_end = p.freq;
            p.vib_depth = r.range(3.0, 7.0);
            p.vib_rate = r.range(5.0, 9.0);
            p.attack = 0.3;
            p.hold = 1.6;
            p.decay = 0.6;
            p.sub = 0.3;
            p.trem_depth = 0.2;
            p.trem_rate = 12.0;
            p.reverb = 0.35;
        }
        _ => {}
    }
    p
}

/// Randomly perturb a sound (amount 0..1), keeping its character.
pub fn mutate(p: &SfxParams, amount: f32, seed: u32) -> SfxParams {
    let mut r = Rng::new(seed ^ 0xA5A5_5A5A);
    let a = clamp(amount, 0.0, 1.0);
    let mut m = |x: f32, lo: f32, hi: f32| clamp(x * powf(2.0, r.bipolar() * a), lo, hi);
    SfxParams {
        freq: m(p.freq, 20.0, 8000.0),
        freq_end: m(p.freq_end, 20.0, 8000.0),
        vib_depth: m(p.vib_depth, 0.0, 24.0),
        vib_rate: m(p.vib_rate, 0.1, 80.0),
        fm_index: m(p.fm_index, 0.0, 12.0),
        fm_index_end: m(p.fm_index_end, 0.0, 12.0),
        noise_tone: m(p.noise_tone, 100.0, 16000.0),
        hold: m(p.hold, 0.0, 4.0),
        decay: m(p.decay, 0.01, 4.0),
        lp: m(p.lp, 100.0, 18000.0),
        lp_end: m(p.lp_end, 100.0, 18000.0),
        repeat: if p.repeat > 0.0 { m(p.repeat, 0.3, 40.0) } else { 0.0 },
        trem_rate: m(p.trem_rate, 0.1, 40.0),
        seed: seed,
        ..*p
    }
}

fn envelope(p: &SfxParams, t: f32) -> f32 {
    if t < 0.0 {
        return 0.0;
    }
    let a = p.attack.max(1e-4);
    if t < a {
        return t / a;
    }
    let t2 = t - a;
    let punch = 1.0 + p.punch * expf(-t2 * 30.0);
    if t2 < p.hold {
        return punch;
    }
    let d = p.decay.max(1e-3);
    let u = (t2 - p.hold) / d;
    if u >= 1.0 {
        return 0.0;
    }
    let k = 1.0 - u;
    k * k * punch
}

/// Render a sound (mono, `fs`), normalised to −1 dBFS.
pub fn render(p: &SfxParams, fs: f32) -> Vec<f32> {
    let voice = p.attack + p.hold + p.decay;
    let base = if p.length > 0.0 { p.length } else { voice };
    let tail = if p.echo > 0.0 || p.reverb > 0.0 { 0.9 } else { 0.05 };
    let n = ((base + tail) * fs) as usize;
    let mut out = vec![0.0f32; n.max(1)];
    let mut rng = Rng::new(p.seed.max(1));
    let mut osc = Phasor::default();
    let mut sub = Phasor::default();
    let mut vib = Phasor::default();
    let mut trem = Phasor::default();
    let mut flfo = Phasor::default();
    let mut lp = Biquad::new(Kind::Lowpass, p.lp, p.res, fs);
    let mut hp = Biquad::new(Kind::Highpass, p.hp, 0.707, fs);
    let mut noise_lp = Smooth::new(0.0, 1.0 / (TAU * p.noise_tone.max(50.0)), fs);
    let mut hold = 0.0f32;
    let mut hold_n = 0.0f32;
    let mut crackle_env = 0.0f32;
    let period = if p.repeat > 0.0 { 1.0 / p.repeat } else { f32::INFINITY };
    let mut trig_index = u32::MAX;
    let mut trig_pitch = 1.0f32;
    let mut trig_rng = Rng::new(p.seed.wrapping_add(99));
    for (i, y) in out.iter_mut().enumerate() {
        let t = i as f32 / fs;
        if t > base {
            break;
        }
        // retrigger
        let (k, tl) = if period.is_finite() { ((t / period) as u32, t - floorf(t / period) * period) } else { (0, t) };
        if k != trig_index {
            trig_index = k;
            trig_pitch = if p.jitter > 0.0 && k > 0 { semis_to_ratio(trig_rng.bipolar() * p.jitter) } else { 1.0 };
        }
        let mut env = envelope(p, tl);
        if p.double > 0.0 {
            env = env.max(0.7 * envelope(p, tl - p.double));
        }
        // fade the last 20 ms of the whole sound so repeats end cleanly
        let fade = clamp((base - t) / 0.02, 0.0, 1.0);
        env *= fade;
        let prog = clamp(tl / voice.max(1e-3), 0.0, 1.0);
        let shape = powf(prog, p.curve.max(0.05));
        let mut f = p.freq.max(1.0) * powf(p.freq_end.max(1.0) / p.freq.max(1.0), shape);
        if p.arp != 0.0 && prog >= p.arp_at {
            f *= semis_to_ratio(p.arp);
        }
        f *= trig_pitch;
        if p.vib_depth > 0.0 {
            f *= semis_to_ratio(p.vib_depth * vib.sine(p.vib_rate, fs));
        }
        let f = clamp(f, 1.0, fs * 0.45);
        let dt = f / fs;
        let ph = osc.tick(f, fs);
        let mut s = match p.wave {
            0 => sinf(TAU * ph),
            1 => {
                let d = clamp(p.duty, 0.05, 0.95);
                let mut v = if ph < d { 1.0 } else { -1.0 };
                v += poly_blep(ph, dt);
                let mut q = ph - d;
                if q < 0.0 {
                    q += 1.0;
                }
                v - poly_blep(q, dt)
            }
            2 => 2.0 * ph - 1.0 - poly_blep(ph, dt),
            3 => 1.0 - 4.0 * (ph - 0.5).abs(),
            4 => 0.0,
            _ => {
                let idx = p.fm_index + (p.fm_index_end - p.fm_index) * prog;
                sinf(TAU * ph + idx * sinf(TAU * ph * p.fm_ratio))
            }
        };
        if p.wave == 4 || p.noise > 0.0 {
            let n = noise_lp.next(rng.bipolar()) * 2.5;
            s = if p.wave == 4 { n } else { s * (1.0 - p.noise * 0.6) + n * p.noise };
        }
        if p.sub > 0.0 {
            s += sub.sine(f * 0.5, fs) * p.sub;
        }
        // filter (coefficients every 32 samples)
        if i % 32 == 0 {
            let mut cut = p.lp + (p.lp_end - p.lp) * prog;
            if p.flt_lfo > 0.0 {
                cut *= powf(2.0, p.flt_lfo * sinf(TAU * flfo.phase));
            }
            lp.set(Kind::Lowpass, cut, p.res, fs);
        }
        flfo.tick(p.flt_lfo_rate, fs);
        s = hp.run(lp.run(s));
        if p.trem_depth > 0.0 {
            s *= 1.0 - p.trem_depth * (0.5 + 0.5 * trem.sine(p.trem_rate, fs));
        }
        if p.crackle > 0.0 {
            if rng.unit() < p.crackle * 0.004 {
                crackle_env = rng.range(0.5, 1.6);
            }
            crackle_env *= 0.996;
            s *= 1.0 + crackle_env * p.crackle * 2.0;
        }
        if p.drive > 0.0 {
            let k = 1.0 + 9.0 * p.drive;
            s = soft_clip(s * k) / soft_clip(k);
        }
        if p.crush > 0.0 {
            hold_n -= 1.0;
            if hold_n <= 0.0 {
                let q = powf(2.0, 16.0 - 12.0 * p.crush);
                hold = floorf(s * q + 0.5) / q;
                hold_n += 1.0 + 15.0 * p.crush;
            }
            s = hold;
        }
        *y = s * env;
    }
    if p.echo > 0.0 || p.reverb > 0.0 {
        let rp = RackParams { echo: p.echo, echo_ms: 180.0, echo_fb: 0.4, reverb: p.reverb, room: 0.7, ..Default::default() };
        // rack expects voice-level input
        normalise(&mut out, 0.5);
        process_clip(&mut out, fs, &rp);
    }
    normalise(&mut out, db_to_gain(-1.0 + p.gain.min(0.0)));
    out
}

/// Scale so the peak is `peak` (no-op on silence).
pub fn normalise(x: &mut [f32], peak: f32) {
    let m = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    if m > 1e-6 {
        let g = peak / m;
        x.iter_mut().for_each(|v| *v *= g);
    }
}
