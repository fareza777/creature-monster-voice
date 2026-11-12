//! Creature Tongue: any text → a deterministic alien language. Each word is hashed (FNV-1a) to
//! seed a generator over a phoneme inventory, so the same sentence always "translates" the same
//! way and word lengths follow the original. Three dialects change the inventory.

use crate::dsp::Rng;
use crate::text::{cons, vowel};
use chimera::phonetics::Segment;

pub struct Dialect {
    pub onsets: &'static [&'static str],
    pub vowels: &'static [&'static str],
    pub codas: &'static [&'static str],
    /// chance of a coda per syllable (0..1)
    pub coda_p: f32,
}

/// Guttural: uvulars, velar fricatives, back vowels (orcs, demons).
pub const GUTTURAL: Dialect = Dialect {
    onsets: &["k", "g", "x", "ʁ", "q", "ɣ", "ʔ", "z", "ʒ", "d", "b", "χ", "r"],
    vowels: &["ɑ", "u", "ɔ", "ə", "a", "o", "ʌ"],
    codas: &["r", "x", "k", "ʁ", "g", "χ", "z", "ŋ"],
    coda_p: 0.55,
};
/// Liquid: nasals, laterals, front vowels (elves, sirens, ghosts).
pub const LIQUID: Dialect = Dialect {
    onsets: &["l", "m", "n", "s", "ʃ", "j", "w", "v", "θ", "ɲ", "h"],
    vowels: &["i", "e", "a", "ɛ", "y", "ø", "u", "o"],
    codas: &["l", "n", "s", "m", "ʃ"],
    coda_p: 0.3,
};
/// Insectoid: clicks of stops, sibilants, close vowels (bugs, aliens).
pub const INSECTOID: Dialect = Dialect {
    onsets: &["t", "k", "p", "ts", "tʃ", "s", "z", "ʃ", "c", "ɟ", "q"],
    vowels: &["i", "ɨ", "ɯ", "y", "e", "u"],
    codas: &["t", "k", "s", "ʃ", "ts"],
    coda_p: 0.5,
};

pub fn dialect(name: &str) -> &'static Dialect {
    match name {
        "liquid" => &LIQUID,
        "insectoid" => &INSECTOID,
        _ => &GUTTURAL,
    }
}

fn fnv(s: &str) -> u32 {
    let mut h: u32 = 0x811C_9DC5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

/// One word → alien segments; stress on the first syllable.
pub fn word(w: &str, d: &Dialect) -> Vec<Segment> {
    let letters = w.chars().filter(|c| c.is_alphanumeric()).count();
    if letters == 0 {
        return Vec::new();
    }
    let mut rng = Rng::new(fnv(w));
    let syllables = (letters as f32 / 2.8).round().clamp(1.0, 5.0) as usize;
    let mut out = Vec::new();
    for s in 0..syllables {
        if s == 0 || rng.unit() < 0.85 {
            out.push(cons(rng.pick(d.onsets)));
        }
        out.push(vowel(rng.pick(d.vowels), if s == 0 { 1 } else { 0 }));
        if rng.unit() < d.coda_p {
            out.push(cons(rng.pick(d.codas)));
        }
    }
    out
}

/// Numbers in Creature Tongue are their digits' names hashed like words.
pub fn number(n: u64) -> String {
    n.to_string().chars().map(|c| format!("zz{c}")).collect::<Vec<_>>().join(" ")
}
