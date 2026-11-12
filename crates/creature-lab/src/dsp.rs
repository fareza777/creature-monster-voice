//! DSP primitives used by the rack, the SFX synth and the editor. All math goes through `libm`
//! so native tests and the wasm build produce the same numbers. Nothing here allocates after
//! construction.

use libm::{cosf, expf, powf, sinf, sqrtf, tanhf};

pub const TAU: f32 = core::f32::consts::TAU;
pub const PI: f32 = core::f32::consts::PI;

#[inline]
pub fn clamp(x: f32, lo: f32, hi: f32) -> f32 {
    if x < lo { lo } else if x > hi { hi } else { x }
}

#[inline]
pub fn db_to_gain(db: f32) -> f32 {
    powf(10.0, db / 20.0)
}

#[inline]
pub fn semis_to_ratio(s: f32) -> f32 {
    powf(2.0, s / 12.0)
}

/// Fast-ish soft saturation with unity small-signal gain.
#[inline]
pub fn soft_clip(x: f32) -> f32 {
    tanhf(x)
}

/// One-pole smoother: `y += k (target - y)`, `k` from a time constant.
#[derive(Clone, Copy, Debug)]
pub struct Smooth {
    pub y: f32,
    k: f32,
}

impl Smooth {
    pub fn new(value: f32, tau_s: f32, rate: f32) -> Self {
        let mut s = Smooth { y: value, k: 1.0 };
        s.set_tau(tau_s, rate);
        s
    }
    pub fn set_tau(&mut self, tau_s: f32, rate: f32) {
        self.k = if tau_s <= 0.0 { 1.0 } else { 1.0 - expf(-1.0 / (tau_s * rate)) };
    }
    #[inline]
    pub fn next(&mut self, target: f32) -> f32 {
        self.y += self.k * (target - self.y);
        self.y
    }
}

/// RBJ biquad (direct form I transposed).
#[derive(Clone, Copy, Debug, Default)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Lowpass,
    Highpass,
    Bandpass,
    Peaking(f32),
    LowShelf(f32),
    HighShelf(f32),
}

impl Biquad {
    pub fn new(kind: Kind, freq: f32, q: f32, fs: f32) -> Self {
        let mut b = Biquad::default();
        b.set(kind, freq, q, fs);
        b
    }

    pub fn set(&mut self, kind: Kind, freq: f32, q: f32, fs: f32) {
        let f = clamp(freq, 10.0, fs * 0.45);
        let w = TAU * f / fs;
        let (sw, cw) = (sinf(w), cosf(w));
        let q = q.max(0.05);
        let alpha = sw / (2.0 * q);
        let (b0, b1, b2, a0, a1, a2) = match kind {
            Kind::Lowpass => ((1.0 - cw) / 2.0, 1.0 - cw, (1.0 - cw) / 2.0, 1.0 + alpha, -2.0 * cw, 1.0 - alpha),
            Kind::Highpass => ((1.0 + cw) / 2.0, -(1.0 + cw), (1.0 + cw) / 2.0, 1.0 + alpha, -2.0 * cw, 1.0 - alpha),
            Kind::Bandpass => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cw, 1.0 - alpha),
            Kind::Peaking(db) => {
                let a = powf(10.0, db / 40.0);
                (1.0 + alpha * a, -2.0 * cw, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * cw, 1.0 - alpha / a)
            }
            Kind::LowShelf(db) => {
                let a = powf(10.0, db / 40.0);
                let s = 2.0 * sqrtf(a) * alpha;
                (
                    a * ((a + 1.0) - (a - 1.0) * cw + s),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cw),
                    a * ((a + 1.0) - (a - 1.0) * cw - s),
                    (a + 1.0) + (a - 1.0) * cw + s,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cw),
                    (a + 1.0) + (a - 1.0) * cw - s,
                )
            }
            Kind::HighShelf(db) => {
                let a = powf(10.0, db / 40.0);
                let s = 2.0 * sqrtf(a) * alpha;
                (
                    a * ((a + 1.0) + (a - 1.0) * cw + s),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cw),
                    a * ((a + 1.0) + (a - 1.0) * cw - s),
                    (a + 1.0) - (a - 1.0) * cw + s,
                    2.0 * ((a - 1.0) - (a + 1.0) * cw),
                    (a + 1.0) - (a - 1.0) * cw - s,
                )
            }
        };
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[inline]
    pub fn run(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        // flush denormals / recover from blow-ups
        if !y.is_finite() {
            self.z1 = 0.0;
            self.z2 = 0.0;
            return 0.0;
        }
        y
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

/// Circular delay line with fractional (linear) reads.
#[derive(Clone, Debug)]
pub struct Delay {
    buf: Vec<f32>,
    w: usize,
}

impl Delay {
    pub fn new(max_samples: usize) -> Self {
        Delay { buf: vec![0.0; max_samples.max(4)], w: 0 }
    }
    pub fn len(&self) -> usize {
        self.buf.len()
    }
    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }
    #[inline]
    pub fn push(&mut self, x: f32) {
        self.buf[self.w] = x;
        self.w += 1;
        if self.w == self.buf.len() {
            self.w = 0;
        }
    }
    /// Sample written `d` samples ago (`d` ≥ 1 means before the last push).
    #[inline]
    pub fn read(&self, d: f32) -> f32 {
        let n = self.buf.len();
        let d = clamp(d, 0.0, (n - 2) as f32);
        let di = d as usize;
        let frac = d - di as f32;
        let i0 = (self.w + n - 1 - di) % n;
        let i1 = (i0 + n - 1) % n;
        self.buf[i0] * (1.0 - frac) + self.buf[i1] * frac
    }
    pub fn clear(&mut self) {
        self.buf.iter_mut().for_each(|x| *x = 0.0);
    }
}

/// xorshift32 noise, deterministic from a seed.
#[derive(Clone, Copy, Debug)]
pub struct Rng(pub u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(if seed == 0 { 0x9E37_79B9 } else { seed })
    }
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    /// uniform in [0, 1)
    #[inline]
    pub fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / 16_777_216.0
    }
    /// uniform in [-1, 1)
    #[inline]
    pub fn bipolar(&mut self) -> f32 {
        self.unit() * 2.0 - 1.0
    }
    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.unit()
    }
    pub fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[(self.next_u32() as usize) % xs.len()]
    }
}

/// First-order DC blocker.
#[derive(Clone, Copy, Debug, Default)]
pub struct DcBlock {
    x1: f32,
    y1: f32,
    r: f32,
}

impl DcBlock {
    pub fn new(fs: f32) -> Self {
        DcBlock { x1: 0.0, y1: 0.0, r: 1.0 - TAU * 15.0 / fs }
    }
    #[inline]
    pub fn run(&mut self, x: f32) -> f32 {
        let y = x - self.x1 + self.r * self.y1;
        self.x1 = x;
        self.y1 = if y.is_finite() { y } else { 0.0 };
        self.y1
    }
}

/// Peak envelope follower with separate attack/release.
#[derive(Clone, Copy, Debug)]
pub struct Envelope {
    pub y: f32,
    att: f32,
    rel: f32,
}

impl Envelope {
    pub fn new(attack_s: f32, release_s: f32, fs: f32) -> Self {
        Envelope { y: 0.0, att: 1.0 - expf(-1.0 / (attack_s.max(1e-5) * fs)), rel: 1.0 - expf(-1.0 / (release_s.max(1e-5) * fs)) }
    }
    #[inline]
    pub fn run(&mut self, x: f32) -> f32 {
        let a = x.abs();
        let k = if a > self.y { self.att } else { self.rel };
        self.y += k * (a - self.y);
        self.y
    }
}

/// Sine LFO / oscillator phase accumulator.
#[derive(Clone, Copy, Debug, Default)]
pub struct Phasor {
    pub phase: f32,
}

impl Phasor {
    /// Advance by `freq/fs`, returning the phase before the step in [0, 1).
    #[inline]
    pub fn tick(&mut self, freq: f32, fs: f32) -> f32 {
        let p = self.phase;
        self.phase += freq / fs;
        self.phase -= libm::floorf(self.phase);
        p
    }
    #[inline]
    pub fn sine(&mut self, freq: f32, fs: f32) -> f32 {
        sinf(TAU * self.tick(freq, fs))
    }
}

/// PolyBLEP correction for band-limited saw/square.
#[inline]
pub fn poly_blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let x = t / dt;
        x + x - x * x - 1.0
    } else if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        x * x + x + x + 1.0
    } else {
        0.0
    }
}

/// Peak limiter (instant attack, smooth release) followed by a soft knee; ceiling ≈ −1 dBFS.
#[derive(Clone, Copy, Debug)]
pub struct Limiter {
    env: f32,
    rel: f32,
    ceiling: f32,
}

impl Limiter {
    pub fn new(fs: f32) -> Self {
        Limiter { env: 0.0, rel: 1.0 - expf(-1.0 / (0.08 * fs)), ceiling: 0.89 }
    }
    #[inline]
    pub fn run(&mut self, x: f32) -> f32 {
        let a = x.abs();
        if a > self.env {
            self.env = a;
        } else {
            self.env += self.rel * (a - self.env);
        }
        let g = if self.env > self.ceiling { self.ceiling / self.env } else { 1.0 };
        let y = x * g;
        // gentle safety saturation above the ceiling (transients the envelope missed)
        if y.abs() > self.ceiling { self.ceiling * soft_clip(y / self.ceiling) } else { y }
    }
}
