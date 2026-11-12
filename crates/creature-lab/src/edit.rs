//! Clip editor operations (non-destructive in the app: each op returns a new clip, the UI keeps
//! the undo stack).

use crate::dsp::{clamp, db_to_gain};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum EditOp {
    /// keep [start, end) seconds
    Trim { start: f32, end: f32 },
    FadeIn { secs: f32 },
    FadeOut { secs: f32 },
    Gain { db: f32 },
    /// scale to this peak (dBFS)
    Normalize { db: f32 },
    Reverse,
    /// tape-style speed change (pitch follows)
    Speed { factor: f32 },
    Echo { ms: f32, feedback: f32, mix: f32 },
    /// insert silence at the start (s)
    PadStart { secs: f32 },
    /// remove leading and trailing silence below this level (dBFS)
    TrimSilence { db: f32 },
}

pub fn apply(pcm: &[f32], fs: f32, op: &EditOp) -> Vec<f32> {
    let n = pcm.len();
    let at = |s: f32| clamp((s * fs) as f32, 0.0, n as f32) as usize;
    match *op {
        EditOp::Trim { start, end } => {
            let (a, b) = (at(start.min(end)), at(start.max(end)));
            pcm[a..b.max(a)].to_vec()
        }
        EditOp::FadeIn { secs } => {
            let m = at(secs).max(1);
            pcm.iter().enumerate().map(|(i, x)| if i < m { let g = i as f32 / m as f32; x * g * g } else { *x }).collect()
        }
        EditOp::FadeOut { secs } => {
            let m = at(secs).max(1);
            pcm.iter()
                .enumerate()
                .map(|(i, x)| {
                    let left = n - i;
                    if left <= m {
                        let g = left as f32 / m as f32;
                        x * g * g
                    } else {
                        *x
                    }
                })
                .collect()
        }
        EditOp::Gain { db } => {
            let g = db_to_gain(clamp(db, -48.0, 24.0));
            pcm.iter().map(|x| clamp(x * g, -1.0, 1.0)).collect()
        }
        EditOp::Normalize { db } => {
            let peak = pcm.iter().fold(0.0f32, |m, x| m.max(x.abs()));
            if peak < 1e-6 {
                return pcm.to_vec();
            }
            let g = db_to_gain(clamp(db, -30.0, 0.0)) / peak;
            pcm.iter().map(|x| x * g).collect()
        }
        EditOp::Reverse => pcm.iter().rev().copied().collect(),
        EditOp::Speed { factor } => {
            let f = clamp(factor, 0.25, 4.0);
            let m = ((n as f32) / f) as usize;
            (0..m)
                .map(|i| {
                    let pos = i as f32 * f;
                    let k = pos as usize;
                    let fr = pos - k as f32;
                    // Catmull-Rom
                    let g = |j: isize| pcm[(k as isize + j).clamp(0, n as isize - 1) as usize];
                    let (y0, y1, y2, y3) = (g(-1), g(0), g(1), g(2));
                    y1 + 0.5 * fr * (y2 - y0 + fr * (2.0 * y0 - 5.0 * y1 + 4.0 * y2 - y3 + fr * (3.0 * (y1 - y2) + y3 - y0)))
                })
                .collect()
        }
        EditOp::Echo { ms, feedback, mix } => {
            let d = ((clamp(ms, 20.0, 1500.0) * 0.001) * fs) as usize;
            let fb = clamp(feedback, 0.0, 0.9);
            let mix = clamp(mix, 0.0, 1.0);
            // let the echoes ring out
            let tail = if fb > 0.0 { ((libm::logf(0.001) / libm::logf(fb.max(0.01))) as usize).min(12) * d } else { d };
            let mut out = vec![0.0f32; n + tail];
            let mut wet = vec![0.0f32; n + tail];
            for i in 0..out.len() {
                let x = if i < n { pcm[i] } else { 0.0 };
                let delayed = if i >= d { wet[i - d] } else { 0.0 };
                wet[i] = x + delayed * fb;
                out[i] = x + delayed * mix;
            }
            let peak = out.iter().fold(0.0f32, |m, x| m.max(x.abs()));
            if peak > 0.99 {
                let g = 0.99 / peak;
                out.iter_mut().for_each(|x| *x *= g);
            }
            out
        }
        EditOp::PadStart { secs } => {
            let mut out = vec![0.0; at(secs.max(0.0)).min(10 * fs as usize)];
            out.extend_from_slice(pcm);
            out
        }
        EditOp::TrimSilence { db } => {
            let thr = db_to_gain(clamp(db, -90.0, -10.0));
            let a = pcm.iter().position(|x| x.abs() > thr).unwrap_or(0);
            let b = pcm.iter().rposition(|x| x.abs() > thr).map_or(n, |i| (i + 1 + (0.02 * fs) as usize).min(n));
            let a = a.saturating_sub((0.01 * fs) as usize);
            pcm[a..b.max(a)].to_vec()
        }
    }
}

/// Peak envelope for drawing (`bins` columns of (min, max)).
pub fn waveform(pcm: &[f32], bins: usize) -> Vec<f32> {
    let bins = bins.clamp(1, 4096);
    let mut out = Vec::with_capacity(bins * 2);
    let n = pcm.len().max(1);
    for b in 0..bins {
        let a = b * n / bins;
        let e = ((b + 1) * n / bins).max(a + 1).min(pcm.len());
        let (mut lo, mut hi) = (0.0f32, 0.0f32);
        for x in pcm.get(a..e).unwrap_or(&[]) {
            lo = lo.min(*x);
            hi = hi.max(*x);
        }
        out.push(lo);
        out.push(hi);
    }
    out
}
