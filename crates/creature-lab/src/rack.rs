//! The DNA effect rack: the chain that turns a physical human voice (or a microphone) into a
//! specimen. Real-time safe: every buffer is allocated in [`Rack::new`]; `process` only reads and
//! writes them. Parameters live in a flat array (the order of [`KEYS`]) so the AudioWorklet can
//! write them straight into wasm memory; they are smoothed every [`CTRL`] samples.

use crate::dsp::*;
use libm::{floorf, powf, sinf};
use serde::{Deserialize, Serialize};

/// Samples between parameter-smoothing / coefficient updates.
const CTRL: usize = 16;
const VOC_BANDS: usize = 16;

macro_rules! rack_params {
    ($( $idx:expr, $field:ident, $key:literal, $def:expr, $lo:expr, $hi:expr; )*) => {
        /// Rack settings (JSON shape, camelCase). Defaults are a transparent rack.
        #[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase", default)]
        pub struct RackParams { $( pub $field: f32, )* }

        impl Default for RackParams {
            fn default() -> Self { RackParams { $( $field: $def, )* } }
        }

        /// Parameter names in array order.
        pub const KEYS: &[&str] = &[ $( $key, )* ];
        /// (min, max) per parameter, array order.
        pub const RANGES: &[(f32, f32)] = &[ $( ($lo, $hi), )* ];

        impl RackParams {
            pub fn to_array(&self) -> [f32; N_PARAMS] {
                let mut a = [0.0; N_PARAMS];
                $( a[$idx] = self.$field; )*
                a
            }
            pub fn from_array(a: &[f32]) -> Self {
                let mut p = RackParams::default();
                $( if let Some(x) = a.get($idx) { if x.is_finite() { p.$field = *x; } } )*
                p
            }
            /// Clamp every value into its range.
            pub fn clamped(mut self) -> Self {
                let mut a = self.to_array();
                for (i, x) in a.iter_mut().enumerate() { *x = clamp(*x, RANGES[i].0, RANGES[i].1); }
                self = RackParams::from_array(&a);
                self
            }
            /// Linear blend (A↔B morphing).
            pub fn lerp(&self, b: &RackParams, t: f32) -> RackParams {
                let (x, y) = (self.to_array(), b.to_array());
                let mut o = [0.0; N_PARAMS];
                for i in 0..N_PARAMS { o[i] = x[i] + (y[i] - x[i]) * t; }
                RackParams::from_array(&o)
            }
        }
    };
}

pub const N_PARAMS: usize = 29;

rack_params! {
    0, shift, "shift", 0.0, -12.0, 12.0;
    1, shift_mix, "shiftMix", 0.0, 0.0, 1.0;
    2, sub, "sub", 0.0, 0.0, 1.0;
    3, growl, "growl", 0.0, 0.0, 1.0;
    4, growl_rate, "growlRate", 32.0, 8.0, 90.0;
    5, drive, "drive", 0.0, 0.0, 1.0;
    6, ring, "ring", 0.0, 0.0, 1.0;
    7, ring_freq, "ringFreq", 60.0, 20.0, 2000.0;
    8, ring_lfo, "ringLfo", 0.0, 0.0, 1.0;
    9, crush, "crush", 0.0, 0.0, 1.0;
    10, bits, "bits", 16.0, 3.0, 16.0;
    11, downsample, "downsample", 1.0, 1.0, 24.0;
    12, comb, "comb", 0.0, 0.0, 0.95;
    13, comb_ms, "combMs", 4.5, 1.0, 20.0;
    14, flanger, "flanger", 0.0, 0.0, 1.0;
    15, flanger_rate, "flangerRate", 0.35, 0.05, 8.0;
    16, vocoder, "vocoder", 0.0, 0.0, 1.0;
    17, vocoder_pitch, "vocoderPitch", 110.0, 40.0, 800.0;
    18, trill, "trill", 0.0, 0.0, 1.0;
    19, trill_rate, "trillRate", 8.0, 2.0, 25.0;
    20, low_cut, "lowCut", 50.0, 20.0, 600.0;
    21, tone, "tone", 0.0, -1.0, 1.0;
    22, echo, "echo", 0.0, 0.0, 1.0;
    23, echo_ms, "echoMs", 260.0, 30.0, 900.0;
    24, echo_fb, "echoFb", 0.35, 0.0, 0.9;
    25, reverb, "reverb", 0.0, 0.0, 1.0;
    26, room, "room", 0.5, 0.0, 1.0;
    27, gain_db, "gainDb", 0.0, -24.0, 24.0;
    28, mix, "mix", 1.0, 0.0, 1.0;
}

const _: () = assert!(N_PARAMS == 29);

// ------------------------------------------------------------------ freeverb-style reverb

#[derive(Clone, Debug)]
struct Comb {
    buf: Vec<f32>,
    i: usize,
    store: f32,
}

impl Comb {
    fn new(n: usize) -> Self {
        Comb { buf: vec![0.0; n.max(2)], i: 0, store: 0.0 }
    }
    #[inline]
    fn run(&mut self, x: f32, fb: f32, damp: f32) -> f32 {
        let y = self.buf[self.i];
        self.store = y * (1.0 - damp) + self.store * damp;
        self.buf[self.i] = x + self.store * fb;
        self.i += 1;
        if self.i == self.buf.len() {
            self.i = 0;
        }
        y
    }
}

#[derive(Clone, Debug)]
struct AllPass {
    buf: Vec<f32>,
    i: usize,
}

impl AllPass {
    fn new(n: usize) -> Self {
        AllPass { buf: vec![0.0; n.max(2)], i: 0 }
    }
    #[inline]
    fn run(&mut self, x: f32) -> f32 {
        let b = self.buf[self.i];
        let y = -x + b;
        self.buf[self.i] = x + b * 0.5;
        self.i += 1;
        if self.i == self.buf.len() {
            self.i = 0;
        }
        y
    }
}

#[derive(Clone, Debug)]
struct Reverb {
    combs: Vec<Comb>,
    aps: Vec<AllPass>,
}

impl Reverb {
    fn new(fs: f32) -> Self {
        let k = fs / 44100.0;
        let combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].iter().map(|&n| Comb::new((n as f32 * k) as usize)).collect();
        let aps = [556, 441, 341, 225].iter().map(|&n| AllPass::new((n as f32 * k) as usize)).collect();
        Reverb { combs, aps }
    }
    #[inline]
    fn run(&mut self, x: f32, room: f32) -> f32 {
        let fb = 0.7 + 0.28 * room;
        let damp = 0.35 - 0.15 * room;
        let input = x * 0.015;
        let mut s = 0.0;
        for c in self.combs.iter_mut() {
            s += c.run(input, fb, damp);
        }
        for a in self.aps.iter_mut() {
            s = a.run(s);
        }
        s
    }
}

// ------------------------------------------------------------------ the rack

#[derive(Clone, Debug)]
pub struct Rack {
    fs: f32,
    /// target values (written by the host), array order
    pub target: [f32; N_PARAMS],
    cur: [f32; N_PARAMS],
    k_ctrl: f32,
    ctrl: usize,
    hp: Biquad,
    hp_f: f32,
    low_shelf: Biquad,
    high_shelf: Biquad,
    tone_v: f32,
    // pitch / formant shifter
    pdelay: Delay,
    pphase: f32,
    pwin: f32,
    // sub-octave
    sub_lp: Biquad,
    sub_lp2: Biquad,
    sub_env: Envelope,
    sub_high: bool,
    sub_flip: bool,
    // growl
    growl_ph: Phasor,
    growl_jit: Smooth,
    rasp_bp: Biquad,
    env: Envelope,
    rng: Rng,
    // ring
    ring_ph: Phasor,
    ring_lfo: Phasor,
    // vocoder
    voc_a: [Biquad; VOC_BANDS],
    voc_s: [Biquad; VOC_BANDS],
    voc_e: [Envelope; VOC_BANDS],
    voc_ph: f32,
    // comb, flanger, trill, echo
    comb_d: Delay,
    flang_d: Delay,
    flang_ph: Phasor,
    trill_d: Delay,
    trill_ph: Phasor,
    echo_d: Delay,
    // crusher
    hold: f32,
    hold_n: f32,
    reverb: Reverb,
    dc: DcBlock,
    lim: Limiter,
    out_env: Envelope,
}

impl Rack {
    pub fn new(fs: f32) -> Rack {
        let fs = clamp(fs, 8000.0, 192000.0);
        let def = RackParams::default().to_array();
        let mut voc_a = [Biquad::default(); VOC_BANDS];
        let mut voc_s = [Biquad::default(); VOC_BANDS];
        for i in 0..VOC_BANDS {
            let f = 120.0 * powf(7000.0 / 120.0, i as f32 / (VOC_BANDS - 1) as f32);
            voc_a[i] = Biquad::new(Kind::Bandpass, f, 5.0, fs);
            voc_s[i] = Biquad::new(Kind::Bandpass, f, 5.0, fs);
        }
        let ms = |m: f32| (m * 0.001 * fs) as usize + 8;
        Rack {
            fs,
            target: def,
            cur: def,
            k_ctrl: 1.0 - libm::expf(-(CTRL as f32) / (0.02 * fs)),
            ctrl: 0,
            hp: Biquad::new(Kind::Highpass, def[20], 0.707, fs),
            hp_f: def[20],
            low_shelf: Biquad::new(Kind::LowShelf(0.0), 250.0, 0.707, fs),
            high_shelf: Biquad::new(Kind::HighShelf(0.0), 3000.0, 0.707, fs),
            tone_v: 0.0,
            pdelay: Delay::new(ms(120.0)),
            pphase: 0.0,
            pwin: 0.05 * fs,
            sub_lp: Biquad::new(Kind::Lowpass, 420.0, 0.707, fs),
            sub_lp2: Biquad::new(Kind::Lowpass, 260.0, 0.707, fs),
            sub_env: Envelope::new(0.004, 0.06, fs),
            sub_high: false,
            sub_flip: false,
            growl_ph: Phasor::default(),
            growl_jit: Smooth::new(0.0, 0.03, fs),
            rasp_bp: Biquad::new(Kind::Bandpass, 1800.0, 1.2, fs),
            env: Envelope::new(0.003, 0.05, fs),
            rng: Rng::new(0xC0FFEE),
            ring_ph: Phasor::default(),
            ring_lfo: Phasor::default(),
            voc_a,
            voc_s,
            voc_e: [Envelope::new(0.003, 0.03, fs); VOC_BANDS],
            voc_ph: 0.0,
            comb_d: Delay::new(ms(25.0)),
            flang_d: Delay::new(ms(12.0)),
            flang_ph: Phasor::default(),
            trill_d: Delay::new(ms(12.0)),
            trill_ph: Phasor::default(),
            echo_d: Delay::new(ms(1000.0)),
            hold: 0.0,
            hold_n: 0.0,
            reverb: Reverb::new(fs),
            dc: DcBlock::new(fs),
            lim: Limiter::new(fs),
            out_env: Envelope::new(0.005, 0.12, fs),
        }
    }

    pub fn sample_rate(&self) -> f32 {
        self.fs
    }

    /// Set new targets (smoothed from the current values).
    pub fn set(&mut self, p: &RackParams) {
        self.target = p.clamped().to_array();
    }

    /// Jump straight to the targets (offline renders that start from silence).
    pub fn snap(&mut self) {
        self.cur = self.target;
    }

    /// Output envelope (for meters and the hologram).
    pub fn level(&self) -> f32 {
        self.out_env.y
    }

    fn control(&mut self) {
        let k = self.k_ctrl;
        for i in 0..N_PARAMS {
            self.cur[i] += k * (self.target[i] - self.cur[i]);
        }
        let fs = self.fs;
        let lc = self.cur[20];
        if (lc - self.hp_f).abs() > 0.5 {
            self.hp_f = lc;
            self.hp.set(Kind::Highpass, lc, 0.707, fs);
        }
        let tone = self.cur[21];
        if (tone - self.tone_v).abs() > 0.005 {
            self.tone_v = tone;
            self.low_shelf.set(Kind::LowShelf(-tone * 6.0), 250.0, 0.707, fs);
            self.high_shelf.set(Kind::HighShelf(tone * 8.0), 3000.0, 0.707, fs);
        }
        // a longer grain for downward shifts sounds smoother on low voices
        let shift = self.cur[0];
        self.pwin = if shift < 0.0 { 0.06 * fs } else { 0.035 * fs };
    }

    /// Process `buf` in place.
    pub fn process(&mut self, buf: &mut [f32]) {
        let fs = self.fs;
        for x in buf.iter_mut() {
            if self.ctrl == 0 {
                self.control();
                self.ctrl = CTRL;
            }
            self.ctrl -= 1;
            let c = self.cur;
            let input = if x.is_finite() { *x } else { 0.0 };
            let mut s = self.hp.run(input);
            let dry = s;
            let env = self.env.run(s);

            // pitch / formant shifter (two Hann-windowed taps on a sweeping delay)
            self.pdelay.push(s);
            if c[1] > 0.001 && c[0].abs() > 0.02 {
                let ratio = semis_to_ratio(c[0]);
                let win = self.pwin;
                self.pphase += (1.0 - ratio) / win;
                self.pphase -= floorf(self.pphase);
                let p1 = self.pphase;
                let mut p2 = p1 + 0.5;
                if p2 >= 1.0 {
                    p2 -= 1.0;
                }
                let w1 = sinf(PI * p1);
                let w2 = sinf(PI * p2);
                let ps = self.pdelay.read(p1 * win + 2.0) * w1 * w1 + self.pdelay.read(p2 * win + 2.0) * w2 * w2;
                s += (ps - s) * c[1];
            }

            // sub-octave: a flip-flop on the fundamental's rising crossings, shaped by its envelope
            if c[2] > 0.001 {
                let lp = self.sub_lp.run(s);
                let e = self.sub_env.run(lp);
                let thr = 0.15 * e + 1e-4;
                if !self.sub_high && lp > thr {
                    self.sub_high = true;
                    self.sub_flip = !self.sub_flip;
                } else if self.sub_high && lp < -thr {
                    self.sub_high = false;
                }
                let sq = if self.sub_flip { e } else { -e };
                s += self.sub_lp2.run(sq) * c[2] * 1.6;
            }

            // growl: irregular amplitude modulation, a rasp of shaped noise, saturation
            if c[3] > 0.001 {
                let jit = self.growl_jit.next(self.rng.bipolar());
                let lfo = sinf(TAU * self.growl_ph.tick(c[4] * (1.0 + 0.45 * jit), fs));
                s *= 1.0 - c[3] * 0.75 * (0.5 + 0.5 * lfo);
                let rasp = self.rasp_bp.run(self.rng.bipolar()) * env * c[3] * 1.4 * (0.5 + 0.5 * lfo);
                s += rasp;
            }
            let drive = clamp(c[5] + c[3] * 0.35, 0.0, 1.0);
            if drive > 0.001 {
                let k = 1.0 + 10.0 * drive;
                let sat = soft_clip(s * k) / soft_clip(k).max(0.3) * 0.6;
                s += (sat - s) * clamp(drive * 1.5, 0.0, 1.0);
            }

            // ring modulator (robot: low fixed carrier; alien: high wobbling carrier)
            if c[6] > 0.001 {
                let wob = 1.0 + c[8] * 0.45 * sinf(TAU * self.ring_lfo.tick(2.7, fs));
                let car = sinf(TAU * self.ring_ph.tick(c[7] * wob, fs));
                s += (s * car * 1.3 - s) * c[6];
            }

            // channel vocoder with a monotone saw (+ a little noise) carrier
            if c[16] > 0.001 {
                let dt = c[17] / fs;
                self.voc_ph += dt;
                if self.voc_ph >= 1.0 {
                    self.voc_ph -= 1.0;
                }
                let saw = 2.0 * self.voc_ph - 1.0 - poly_blep(self.voc_ph, dt);
                let car = saw * 0.85 + self.rng.bipolar() * 0.15;
                let mut v = 0.0;
                for b in 0..VOC_BANDS {
                    let e = self.voc_e[b].run(self.voc_a[b].run(s));
                    v += self.voc_s[b].run(car) * e;
                }
                s += (v * 9.0 - s) * c[16];
            }

            // metallic comb
            if c[12] > 0.001 {
                let d = c[13] * 0.001 * fs;
                let y = s + c[12] * self.comb_d.read(d);
                self.comb_d.push(soft_clip(y));
                let w = clamp(c[12] * 1.6, 0.0, 1.0);
                s += (y * (1.0 - c[12] * 0.5) - s) * w;
            } else {
                self.comb_d.push(s);
            }

            // flanger
            let fl_d = (0.6 + 2.4 * (0.5 + 0.5 * sinf(TAU * self.flang_ph.tick(c[15], fs)))) * 0.001 * fs;
            let fl = self.flang_d.read(fl_d);
            self.flang_d.push(s + fl * 0.55 * c[14]);
            if c[14] > 0.001 {
                s = (s + fl * c[14] * 0.9) / (1.0 + 0.45 * c[14]);
            }

            // animal trill: vibrato (modulated delay) and tremolo at the same rate
            self.trill_d.push(s);
            if c[18] > 0.001 {
                let ph = self.trill_ph.tick(c[19], fs);
                let lfo = sinf(TAU * ph);
                let d = (1.0 + c[18] * 2.2 * (0.5 + 0.5 * lfo)) * 0.001 * fs;
                let v = self.trill_d.read(d);
                let trem = 1.0 - 0.55 * c[18] * (0.5 + 0.5 * sinf(TAU * ph + 1.3));
                s = (s + (v - s) * c[18]) * trem;
            }

            // bit-crusher / decimator
            if c[9] > 0.001 {
                self.hold_n -= 1.0;
                if self.hold_n <= 0.0 {
                    let q = powf(2.0, c[10] - 1.0);
                    self.hold = floorf(s * q + 0.5) / q;
                    self.hold_n += c[11].max(1.0);
                }
                s += (self.hold - s) * c[9];
            }

            // tone tilt
            s = self.high_shelf.run(self.low_shelf.run(s));

            // echo
            let e = self.echo_d.read(c[23] * 0.001 * fs);
            self.echo_d.push(s + e * c[24]);
            s += e * c[22];

            // reverb
            if c[25] > 0.001 {
                let r = self.reverb.run(s, c[26]);
                s = s * (1.0 - 0.35 * c[25]) + r * c[25];
            }

            // overall amount, gain, output stage
            s = dry + (s - dry) * c[28];
            s *= db_to_gain(c[27]);
            s = self.dc.run(s);
            let a = s.abs();
            if a > 0.7 {
                s = s.signum() * (0.7 + 0.3 * soft_clip((a - 0.7) / 0.3));
            }
            s = self.lim.run(s);
            self.out_env.run(s);
            *x = s;
        }
    }
}

/// Process a whole clip offline with fixed settings (snapped, no glide in).
pub fn process_clip(pcm: &mut [f32], fs: f32, p: &RackParams) {
    let mut r = Rack::new(fs);
    r.set(p);
    r.snap();
    r.process(pcm);
}
