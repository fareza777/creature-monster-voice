//! Spanish orthography → IPA segments (neutral Latin American: seseo and yeísmo).
//!
//! Rules: ch ll rr qu gu gü ñ, c/g before e i, silent h, b/v merger with intervocalic
//! approximants [β ð ɣ], r trill word-initially and after l n s, tap elsewhere, unstressed i/u
//! next to a vowel become glides. Stress: an accent mark wins; otherwise words ending in a vowel,
//! n or s stress the penultimate syllable, others the last.

use crate::text::{cons, is_vowel, vowel};
use chimera::phonetics::Segment;

#[derive(Clone, Copy)]
struct Ph {
    ipa: &'static str,
    accent: bool,
}

fn p(ipa: &'static str) -> Ph {
    Ph { ipa, accent: false }
}

fn letters(w: &str) -> Vec<char> {
    w.to_lowercase().chars().filter(|c| c.is_alphabetic()).collect()
}

pub fn word(w: &str) -> Vec<Segment> {
    let c = letters(w);
    if c.is_empty() {
        return Vec::new();
    }
    let front = |x: Option<&char>| x.is_some_and(|c| "eéií".contains(*c));
    let mut out: Vec<Ph> = Vec::new();
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        let nx = c.get(i + 1);
        let (ph, used): (Vec<Ph>, usize) = match ch {
            'a' => (vec![p("a")], 1),
            'á' => (vec![Ph { ipa: "a", accent: true }], 1),
            'e' => (vec![p("e")], 1),
            'é' => (vec![Ph { ipa: "e", accent: true }], 1),
            'i' => (vec![p("i")], 1),
            'í' => (vec![Ph { ipa: "i", accent: true }], 1),
            'o' => (vec![p("o")], 1),
            'ó' => (vec![Ph { ipa: "o", accent: true }], 1),
            'u' | 'ü' => (vec![p("u")], 1),
            'ú' => (vec![Ph { ipa: "u", accent: true }], 1),
            'b' | 'v' => (vec![p("b")], 1),
            'c' if nx == Some(&'h') => (vec![p("tʃ")], 2),
            'c' if front(nx) => (vec![p("s")], 1),
            'c' => (vec![p("k")], 1),
            'd' => (vec![p("d")], 1),
            'f' => (vec![p("f")], 1),
            'g' if nx == Some(&'u') && front(c.get(i + 2)) => (vec![p("g")], 2),
            'g' if nx == Some(&'ü') => (vec![p("g"), p("w")], 2),
            'g' if front(nx) => (vec![p("x")], 1),
            'g' => (vec![p("g")], 1),
            'h' => (vec![], 1),
            'j' => (vec![p("x")], 1),
            'k' => (vec![p("k")], 1),
            'l' if nx == Some(&'l') => (vec![p("j")], 2),
            'l' => (vec![p("l")], 1),
            'm' => (vec![p("m")], 1),
            'n' => (vec![p("n")], 1),
            'ñ' => (vec![p("ɲ")], 1),
            'p' => (vec![p("p")], 1),
            'q' if nx == Some(&'u') => (vec![p("k")], 2),
            'q' => (vec![p("k")], 1),
            'r' if nx == Some(&'r') => (vec![p("r")], 2),
            'r' => {
                let trill = i == 0 || matches!(out.last().map(|x| x.ipa), Some("l") | Some("n") | Some("s"));
                (vec![p(if trill { "r" } else { "ɾ" })], 1)
            }
            's' => (vec![p("s")], 1),
            't' => (vec![p("t")], 1),
            'w' => (vec![p("w")], 1),
            'x' => (vec![p("k"), p("s")], 1),
            'y' if i + 1 == c.len() => (vec![p("i")], 1),
            'y' => (vec![p("j")], 1),
            'z' => (vec![p("s")], 1),
            _ => (vec![], 1),
        };
        out.extend(ph);
        i += used;
    }
    // glides: an unaccented i/u next to another vowel
    for j in 0..out.len() {
        let v = out[j].ipa;
        if (v == "i" || v == "u") && !out[j].accent {
            let prev_v = j > 0 && is_vowel(out[j - 1].ipa) && !matches!(out[j - 1].ipa, "j" | "w");
            let next_v = out.get(j + 1).is_some_and(|x| is_vowel(x.ipa) && x.ipa != "i" && x.ipa != "u");
            let next_strong = out.get(j + 1).is_some_and(|x| is_vowel(x.ipa));
            if next_v || (next_strong && !prev_v) {
                out[j].ipa = if v == "i" { "j" } else { "w" };
            } else if prev_v && !matches!(out[j - 1].ipa, "i" | "u") {
                out[j].ipa = if v == "i" { "j" } else { "w" };
            }
        }
    }
    // intervocalic voiced stops soften
    for j in 1..out.len() {
        let prev_v = is_vowel(out[j - 1].ipa);
        let next_v = out.get(j + 1).is_some_and(|x| is_vowel(x.ipa));
        if prev_v && next_v {
            out[j].ipa = match out[j].ipa {
                "b" => "β",
                "d" => "ð",
                "g" => "ɣ",
                x => x,
            };
        }
    }
    // stress
    let nuclei: Vec<usize> = (0..out.len()).filter(|&j| is_vowel(out[j].ipa)).collect();
    let stressed = if let Some(&j) = nuclei.iter().find(|&&j| out[j].accent) {
        Some(j)
    } else if nuclei.len() <= 1 {
        nuclei.first().copied()
    } else {
        let last = *c.last().unwrap();
        let penult = "aeiouns".contains(last);
        Some(if penult { nuclei[nuclei.len() - 2] } else { nuclei[nuclei.len() - 1] })
    };
    out.iter()
        .enumerate()
        .map(|(j, x)| if is_vowel(x.ipa) { vowel(x.ipa, if Some(j) == stressed { 1 } else { 0 }) } else { cons(x.ipa) })
        .collect()
}

/// Spanish cardinal numbers (up to the billions).
pub fn number(n: u64) -> String {
    const U: [&str; 30] = [
        "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
        "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
        "veintiséis", "veintisiete", "veintiocho", "veintinueve",
    ];
    const T: [&str; 10] = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    const H: [&str; 10] = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
    fn below_1000(n: u64) -> String {
        if n == 100 {
            return "cien".into();
        }
        let mut p = Vec::new();
        if n >= 100 {
            p.push(H[(n / 100) as usize].to_string());
        }
        let r = n % 100;
        if r > 0 {
            if r < 30 {
                p.push(U[r as usize].to_string());
            } else {
                p.push(T[(r / 10) as usize].to_string());
                if r % 10 > 0 {
                    p.push("y".into());
                    p.push(U[(r % 10) as usize].to_string());
                }
            }
        }
        p.join(" ")
    }
    if n == 0 {
        return "cero".into();
    }
    let mut p = Vec::new();
    let mut rest = n;
    if rest >= 1_000_000 {
        let m = rest / 1_000_000;
        p.push(if m == 1 { "un millón".to_string() } else { format!("{} millones", below_1000(m % 1000)) });
        rest %= 1_000_000;
    }
    if rest >= 1000 {
        let t = rest / 1000;
        p.push(if t == 1 { "mil".to_string() } else { format!("{} mil", below_1000(t)) });
        rest %= 1000;
    }
    if rest > 0 {
        p.push(below_1000(rest));
    }
    p.join(" ")
}
