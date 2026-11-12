//! Shared text front-end: sentence/clause splitting and building the engine's `Phrase` from
//! per-word segments. Each language supplies a word → segments function.

use chimera::phonetics::english::Phrase;
use chimera::phonetics::{Intonation, Segment};

/// A clause of words and how it ends.
pub struct Clause {
    pub words: Vec<String>,
    pub intonation: Intonation,
    pub pause: f64,
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '\'' || c == '-' || c == '’'
}

/// Split text into clauses at sentence punctuation (and commas, with a shorter pause).
pub fn clauses(text: &str) -> Vec<Clause> {
    let mut out = Vec::new();
    let mut words: Vec<String> = Vec::new();
    let mut cur = String::new();
    let flush_word = |cur: &mut String, words: &mut Vec<String>| {
        let w = cur.trim_matches(|c: char| c == '-' || c == '\'' || c == '’').to_string();
        if !w.is_empty() {
            words.push(w);
        }
        cur.clear();
    };
    for ch in text.chars() {
        if is_word_char(ch) {
            cur.push(ch);
            continue;
        }
        flush_word(&mut cur, &mut words);
        let end = match ch {
            '.' | '!' | ';' | ':' | '\n' => Some((Intonation::Statement, 0.38)),
            '?' => Some((Intonation::Question, 0.4)),
            ',' => Some((Intonation::Flat, 0.18)),
            _ => None,
        };
        if let Some((intonation, pause)) = end
            && !words.is_empty()
        {
            out.push(Clause { words: std::mem::take(&mut words), intonation, pause });
        }
    }
    flush_word(&mut cur, &mut words);
    if !words.is_empty() {
        out.push(Clause { words, intonation: Intonation::Statement, pause: 0.3 });
    }
    // a comma clause keeps a gentle fall rather than a flat end when it is the last one
    if let Some(last) = out.last_mut()
        && last.intonation == Intonation::Flat
    {
        last.intonation = Intonation::Statement;
    }
    out
}

/// Build phrases with a word → segments function (numbers expanded by `numbers` first).
pub fn phrases(text: &str, numbers: &dyn Fn(u64) -> String, word: &dyn Fn(&str) -> Vec<Segment>) -> Vec<Phrase> {
    let mut out = Vec::new();
    for c in clauses(text) {
        let mut segments: Vec<Segment> = Vec::new();
        let mut said: Vec<String> = Vec::new();
        for w in &c.words {
            // numbers become words of the language; hyphenated words (reduplication) split
            let expanded: Vec<String> = if w.chars().all(|c| c.is_ascii_digit()) {
                match w.parse::<u64>() {
                    Ok(n) => numbers(n).split_whitespace().map(str::to_string).collect(),
                    Err(_) => w.chars().map(|d| numbers(d.to_digit(10).unwrap_or(0) as u64)).collect(),
                }
            } else {
                w.split('-').filter(|p| !p.is_empty()).map(str::to_string).collect()
            };
            for part in expanded {
                let mut segs = word(&part);
                if segs.is_empty() {
                    continue;
                }
                if let Some(last) = segs.last_mut() {
                    last.word_end = Some(true);
                }
                segments.extend(segs);
                said.push(part);
            }
        }
        if segments.is_empty() {
            continue;
        }
        out.push(Phrase { segments, intonation: c.intonation, pause: c.pause, words: said });
    }
    out
}

/// A vowel segment with stress.
pub fn vowel(ipa: &str, stress: u8) -> Segment {
    Segment { ipa: ipa.into(), stress: Some(stress), ..Default::default() }
}

/// A consonant segment.
pub fn cons(ipa: &str) -> Segment {
    Segment { ipa: ipa.into(), stress: Some(0), ..Default::default() }
}

/// Is this IPA token a vowel (or diphthong)?
pub fn is_vowel(ipa: &str) -> bool {
    ipa.chars().next().is_some_and(|c| "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒɝɚ".contains(c))
}

/// English cardinal numbers (the upstream G2P spells words, not digits).
pub fn english_number(n: u64) -> String {
    const ONES: [&str; 20] = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    const TENS: [&str; 10] = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    fn below_1000(n: u64) -> String {
        let mut parts = Vec::new();
        if n >= 100 {
            parts.push(format!("{} hundred", ONES[(n / 100) as usize]));
        }
        let r = n % 100;
        if r > 0 || n == 0 {
            if r < 20 {
                parts.push(ONES[r as usize].to_string());
            } else {
                let t = TENS[(r / 10) as usize];
                parts.push(if r % 10 == 0 { t.to_string() } else { format!("{t} {}", ONES[(r % 10) as usize]) });
            }
        }
        parts.join(" ")
    }
    if n == 0 {
        return "zero".into();
    }
    let mut parts = Vec::new();
    let scales = [(1_000_000_000u64, "billion"), (1_000_000, "million"), (1_000, "thousand")];
    let mut rest = n;
    for (v, name) in scales {
        if rest >= v {
            parts.push(format!("{} {name}", below_1000(rest / v)));
            rest %= v;
        }
    }
    if rest > 0 {
        parts.push(below_1000(rest));
    }
    parts.join(" ")
}

/// Expand digit runs in English text into words (before the upstream G2P sees it).
pub fn expand_english_numbers(text: &str) -> String {
    let mut out = String::new();
    let mut digits = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_digit() {
            digits.push(c);
            continue;
        }
        if !digits.is_empty() {
            let n: u64 = digits.parse().unwrap_or(0);
            out.push_str(&english_number(n));
            digits.clear();
        }
        out.push(c);
    }
    out.pop();
    out
}
