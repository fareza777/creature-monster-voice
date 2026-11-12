//! WAV encoding/decoding (RIFF, PCM 16-bit mono for export; decode accepts 16/24/32-bit PCM and
//! 32-bit float, any channel count, mixed down to mono).

/// Encode mono samples as 16-bit PCM WAV with TPDF dither.
pub fn encode16(pcm: &[f32], fs: u32) -> Vec<u8> {
    let data_len = (pcm.len() * 2) as u32;
    let mut b = Vec::with_capacity(44 + data_len as usize);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data_len).to_le_bytes());
    b.extend_from_slice(b"WAVE");
    b.extend_from_slice(b"fmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes()); // PCM
    b.extend_from_slice(&1u16.to_le_bytes()); // mono
    b.extend_from_slice(&fs.to_le_bytes());
    b.extend_from_slice(&(fs * 2).to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data_len.to_le_bytes());
    let mut rng = crate::dsp::Rng::new(12345);
    for &x in pcm {
        let d = (rng.unit() - rng.unit()) / 32768.0;
        let v = ((if x.is_finite() { x } else { 0.0 }) + d).clamp(-1.0, 1.0);
        let s = (v * 32767.0).round() as i16;
        b.extend_from_slice(&s.to_le_bytes());
    }
    b
}

/// Decode a WAV file to mono f32 and its sample rate.
pub fn decode(bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("not a WAV file".into());
    }
    let u16_at = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
    let mut i = 12;
    let (mut fmt, mut ch, mut fs, mut bits) = (0u16, 0u16, 0u32, 0u16);
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let len = u32_at(i + 4) as usize;
        let body = i + 8;
        if id == b"fmt " && body + 16 <= bytes.len() {
            fmt = u16_at(body);
            ch = u16_at(body + 2);
            fs = u32_at(body + 4);
            bits = u16_at(body + 14);
            if fmt == 0xFFFE && body + 26 <= bytes.len() {
                fmt = u16_at(body + 24);
            }
        } else if id == b"data" {
            if ch == 0 {
                return Err("WAV: data before fmt".into());
            }
            let end = (body + len).min(bytes.len());
            let data = &bytes[body..end];
            let bps = (bits / 8) as usize;
            let frame = bps * ch as usize;
            if frame == 0 {
                return Err("WAV: bad format".into());
            }
            let frames = data.len() / frame;
            let mut out = Vec::with_capacity(frames);
            for f in 0..frames {
                let mut acc = 0.0f32;
                for c in 0..ch as usize {
                    let o = f * frame + c * bps;
                    let v = match (fmt, bits) {
                        (1, 16) => i16::from_le_bytes([data[o], data[o + 1]]) as f32 / 32768.0,
                        (1, 24) => (((data[o] as i32) << 8 | (data[o + 1] as i32) << 16 | (data[o + 2] as i32) << 24) >> 8) as f32 / 8_388_608.0,
                        (1, 32) => i32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]) as f32 / 2_147_483_648.0,
                        (3, 32) => f32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]),
                        (1, 8) => (data[o] as f32 - 128.0) / 128.0,
                        _ => return Err(format!("WAV: unsupported format {fmt}/{bits}-bit")),
                    };
                    acc += v;
                }
                out.push(acc / ch as f32);
            }
            return Ok((out, fs));
        }
        i = body + len + (len & 1);
    }
    Err("WAV: no data chunk".into())
}

/// Linear-interpolating resample (imports at other rates → 48 kHz).
pub fn resample(pcm: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || from == 0 || pcm.is_empty() {
        return pcm.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let n = (pcm.len() as f64 / ratio) as usize;
    (0..n)
        .map(|i| {
            let p = i as f64 * ratio;
            let k = p as usize;
            let fr = (p - k as f64) as f32;
            let a = pcm[k.min(pcm.len() - 1)];
            let b = pcm[(k + 1).min(pcm.len() - 1)];
            a + (b - a) * fr
        })
        .collect()
}
