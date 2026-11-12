//! # creature-lab
//!
//! The original DSP and language layer of **Creature Voice Studio** (F7 Developer), built on the
//! CHIMERA physical voice engine (`chimera`, MIT, by Jameson Hodge).
//!
//! - [`rack`]: the DNA effect rack (real-time safe)
//! - [`dna`]: specimens (five DNA strands) → voice source + rack + animal splice
//! - [`g2p_id`], [`g2p_es`], [`creature_tongue`]: Indonesian, Spanish and alien front-ends
//! - [`sfx`]: procedural sound effects
//! - [`edit`], [`wav`]: clip editing and WAV I/O
//! - [`render`]: offline render sessions with 60 fps telemetry for the 3D anatomy
//! - [`api`]: the JSON dispatcher the wasm layer exposes

pub mod api;
pub mod creature_tongue;
pub mod dna;
pub mod dsp;
pub mod edit;
pub mod g2p_es;
pub mod g2p_id;
pub mod rack;
pub mod render;
pub mod sfx;
pub mod text;
pub mod wav;
