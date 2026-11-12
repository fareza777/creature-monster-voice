//! Indonesian (Bahasa Indonesia) orthography → IPA segments for the physical voice.
//!
//! Indonesian spelling is close to phonemic. The rules here cover the standard (EYD) spelling:
//! digraphs ng ny sy kh, c → tʃ, j → dʒ, y → j, glottal stop for k before a consonant or at the
//! end of a word, word-final diphthongs ai au oi ei, and the one real ambiguity, the letter e
//! (schwa /ə/ or /e/), resolved by a respelling list, word-final e, and final syllables closed by
//! h or k. Stress falls on the penultimate syllable unless its vowel is a schwa.

use crate::text::{cons, is_vowel, vowel};
use chimera::phonetics::Segment;

/// Words whose e's are not schwas, respelled with é (= /e/) and è (= /ɛ/).
const RESPELL: &[(&str, &str)] = &[
    ("enak", "énak"), ("sore", "soré"), ("merah", "mérah"), ("meja", "méja"), ("nenek", "nénék"),
    ("bebek", "bébék"), ("desa", "désa"), ("tempe", "témpé"), ("sate", "saté"), ("kafe", "kafé"),
    ("ekor", "ékor"), ("elok", "élok"), ("besok", "bésok"), ("becak", "bécak"), ("lele", "lélé"),
    ("kereta", "keréta"), ("boleh", "boléh"), ("oleh", "oléh"), ("leher", "léhér"), ("beres", "bérés"),
    ("ember", "émbér"), ("cewek", "céwék"), ("pesta", "pésta"), ("teh", "téh"), ("monster", "monstér"),
    ("hantu", "hantu"), ("tes", "tés"), ("desember", "désémber"), ("februari", "fébruari"),
    ("energi", "énérgi"), ("ekonomi", "ékonomi"), ("era", "éra"), ("elang", "élang"), ("serem", "sérem"),
    ("seram", "seram"), ("robot", "robot"), ("alien", "alién"), ("zombie", "zombi"), ("vampir", "fampir"),
    ("halo", "halo"), ("hei", "héi"), ("oke", "oké"), ("dewa", "déwa"), ("dewi", "déwi"),
    ("bebas", "bébas"), ("sepeda", "sepéda"), ("pendek", "péndék"), ("gelek", "gelék"), ("jelek", "jelék"),
    ("kecap", "kécap"), ("kaget", "kagét"), ("ketek", "keték"), ("pepaya", "pépaya"), ("pete", "peté"),
    ("rese", "résé"), ("seksi", "séksi"), ("film", "film"), ("video", "fidéo"), ("telepon", "télépon"),
    ("televisi", "téléfisi"), ("teknologi", "téknologi"), ("eksperimen", "éksperimén"), ("laboratorium", "laboratorium"),
    ("efek", "éfék"), ("suara", "suara"), ("selamat", "selamat"), ("malam", "malam"), ("kenal", "kenal"),
];

fn respell(w: &str) -> String {
    for (a, b) in RESPELL {
        if *a == w {
            return (*b).to_string();
        }
    }
    w.to_string()
}

/// One letter group as (ipa, is_vowel). Returns the ipa and how many chars it used.
fn take(chars: &[char], i: usize) -> (Vec<&'static str>, usize) {
    let c = chars[i];
    let next = chars.get(i + 1).copied();
    let after = chars.get(i + 2).copied();
    let is_v = |x: Option<char>| x.is_some_and(|c| "aiueoéè".contains(c));
    match (c, next) {
        ('n', Some('g')) => (vec!["ŋ"], 2),
        ('n', Some('y')) if is_v(after) => (vec!["ɲ"], 2),
        ('s', Some('y')) => (vec!["ʃ"], 2),
        ('k', Some('h')) => (vec!["x"], 2),
        ('c', Some('h')) => (vec!["tʃ"], 2),
        ('t', Some('j')) => (vec!["tʃ"], 2),
        ('d', Some('j')) => (vec!["dʒ"], 2),
        _ => {
            let ipa: Vec<&'static str> = match c {
                'a' => vec!["a"],
                'i' => vec!["i"],
                'u' => vec!["u"],
                'o' => vec!["o"],
                'e' => vec!["ə"],
                'é' => vec!["e"],
                'è' => vec!["ɛ"],
                'b' => vec!["b"],
                'c' => vec!["tʃ"],
                'd' => vec!["d"],
                'f' | 'v' => vec!["f"],
                'g' => vec!["g"],
                'h' => vec!["h"],
                'j' => vec!["dʒ"],
                'k' | 'q' => vec!["k"],
                'l' => vec!["l"],
                'm' => vec!["m"],
                'n' => vec!["n"],
                'p' => vec!["p"],
                'r' => vec!["r"],
                's' => vec!["s"],
                't' => vec!["t"],
                'w' => vec!["w"],
                'x' => vec!["k", "s"],
                'y' => vec!["j"],
                'z' => vec!["z"],
                _ => vec![],
            };
            (ipa, 1)
        }
    }
}

fn normalise(w: &str) -> Vec<char> {
    w.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' => 'a',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ó' | 'ò' | 'ô' | 'ö' => 'o',
            'ê' | 'ë' => 'e',
            c => c,
        })
        .filter(|c| c.is_alphabetic())
        .collect()
}

/// One Indonesian word → segments with stress.
pub fn word(w: &str) -> Vec<Segment> {
    let lower = w.to_lowercase();
    let chars = normalise(&respell(&lower));
    if chars.is_empty() {
        return Vec::new();
    }
    let mut ipa: Vec<&'static str> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let (p, n) = take(&chars, i);
        // doubled consonants (loanwords: "Allah", "kakk") are said once
        if let (Some(prev), Some(cur)) = (ipa.last(), p.first())
            && prev == cur
            && !is_vowel(cur)
        {
            i += n;
            continue;
        }
        ipa.extend(p);
        i += n;
    }
    // word-final diphthongs
    let n = ipa.len();
    if n >= 2 {
        let pair = (ipa[n - 2], ipa[n - 1]);
        let d = match pair {
            ("a", "i") => Some("aɪ"),
            ("a", "u") => Some("aʊ"),
            ("o", "i") => Some("ɔɪ"),
            ("e", "i") | ("ə", "i") => Some("eɪ"),
            _ => None,
        };
        // only when a consonant (or nothing) precedes, so "main" (ma.in) is not touched
        if let Some(d) = d
            && n > 2
            && !is_vowel(ipa[n - 3])
        {
            ipa.truncate(n - 2);
            ipa.push(d);
        }
    }
    // the letter e: word-final e, and e in a final syllable closed by h or k, are /e/
    let n = ipa.len();
    if n >= 2 && ipa[n - 1] == "ə" {
        ipa[n - 1] = "e";
    }
    if n >= 3 && ipa[n - 2] == "ə" && (ipa[n - 1] == "h" || ipa[n - 1] == "k") && ipa.iter().filter(|p| is_vowel(p)).count() >= 2 {
        ipa[n - 2] = "e";
    }
    // k before a consonant or at the end of the word is a glottal stop
    for j in 0..ipa.len() {
        if ipa[j] == "k" {
            let next = ipa.get(j + 1);
            if next.is_none() || next.is_some_and(|p| !is_vowel(p) && *p != "s") {
                ipa[j] = "ʔ";
            }
        }
    }
    // r between vowels is a tap
    for j in 1..ipa.len().saturating_sub(1) {
        if ipa[j] == "r" && is_vowel(ipa[j - 1]) && is_vowel(ipa[j + 1]) {
            ipa[j] = "ɾ";
        }
    }
    // stress: penultimate syllable, or the last if the penultimate vowel is a schwa
    let nuclei: Vec<usize> = (0..ipa.len()).filter(|&j| is_vowel(ipa[j])).collect();
    let stressed = match nuclei.len() {
        0 => None,
        1 => Some(nuclei[0]),
        k => {
            let pen = nuclei[k - 2];
            Some(if ipa[pen] == "ə" { nuclei[k - 1] } else { pen })
        }
    };
    ipa.iter()
        .enumerate()
        .map(|(j, p)| if is_vowel(p) { vowel(p, if Some(j) == stressed { 1 } else { 0 }) } else { cons(p) })
        .collect()
}

/// Indonesian cardinal numbers.
pub fn number(n: u64) -> String {
    const D: [&str; 10] = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
    fn below_1000(n: u64) -> String {
        let mut p = Vec::new();
        let h = n / 100;
        let r = n % 100;
        if h == 1 {
            p.push("seratus".to_string());
        } else if h > 1 {
            p.push(format!("{} ratus", D[h as usize]));
        }
        if r > 0 {
            if r < 10 {
                p.push(D[r as usize].to_string());
            } else if r == 10 {
                p.push("sepuluh".into());
            } else if r == 11 {
                p.push("sebelas".into());
            } else if r < 20 {
                p.push(format!("{} belas", D[(r - 10) as usize]));
            } else {
                p.push(format!("{} puluh", D[(r / 10) as usize]));
                if r % 10 > 0 {
                    p.push(D[(r % 10) as usize].to_string());
                }
            }
        }
        p.join(" ")
    }
    if n == 0 {
        return "nol".into();
    }
    let mut p = Vec::new();
    let mut rest = n;
    if rest >= 1_000_000_000 {
        p.push(format!("{} miliar", below_1000(rest / 1_000_000_000)));
        rest %= 1_000_000_000;
    }
    if rest >= 1_000_000 {
        p.push(format!("{} juta", below_1000(rest / 1_000_000)));
        rest %= 1_000_000;
    }
    if rest >= 1000 {
        let t = rest / 1000;
        p.push(if t == 1 { "seribu".to_string() } else { format!("{} ribu", below_1000(t)) });
        rest %= 1000;
    }
    if rest > 0 {
        p.push(below_1000(rest));
    }
    p.join(" ")
}
