//! The one wasm module of Creature Voice Studio. It re-exports every upstream CHIMERA C-ABI
//! function (`engine_*`, `chimera_*`, from `chimera-wasm`) and adds the lab ABI:
//!
//! - `lab_call(ptr, len)`: JSON dispatcher (`creature_lab::api`), result via `lab_result_ptr/len`
//! - `lab_input_f32(n)` / `lab_input_u8(n)`: resize and return the input buffers
//! - `lab_out_f32_ptr(i)` / `lab_out_f32_len(i)`, `lab_out_u8_ptr()` / `lab_out_u8_len()`: outputs
//! - `lab_rack_*`: a real-time DNA rack for the AudioWorklet
//!
//! No imports, no wasm-bindgen: the AudioWorklet instantiates this module with `{}`.

use creature_lab::api::{LabState, dispatch};
use creature_lab::rack::{N_PARAMS, Rack};
use std::cell::RefCell;

// keep the upstream ABI linked into the cdylib
pub use chimera_wasm;
#[used]
static KEEP_UPSTREAM: [unsafe extern "C" fn(*mut chimera_wasm::Handle, usize) -> *const f32; 1] = [chimera_wasm::engine_render];

thread_local! {
    static LAB: RefCell<LabState> = RefCell::new(LabState::default());
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_version() -> u32 {
    1
}

/// Run one JSON call. Returns 0 on success, 1 if the result is `{error}`.
///
/// # Safety
/// `ptr..ptr+len` must be readable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_call(ptr: *const u8, len: usize) -> u32 {
    let bytes = unsafe { core::slice::from_raw_parts(ptr, len) };
    let out = match serde_json::from_slice::<serde_json::Value>(bytes) {
        Err(e) => Err(format!("bad request: {e}")),
        Ok(req) => LAB.with(|s| dispatch(&mut s.borrow_mut(), &req)),
    };
    let (code, v) = match out {
        Ok(v) => (0, v),
        Err(e) => (1, serde_json::json!({ "error": e })),
    };
    RESULT.with(|r| *r.borrow_mut() = serde_json::to_vec(&v).unwrap_or_else(|_| b"{\"error\":\"unserialisable\"}".to_vec()));
    code
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_result_len() -> usize {
    RESULT.with(|r| r.borrow().len())
}

/// Resize the f32 input buffer to `n` and return its address (valid until the next resize).
#[unsafe(no_mangle)]
pub extern "C" fn lab_input_f32(n: usize) -> *mut f32 {
    LAB.with(|s| {
        let mut s = s.borrow_mut();
        s.input.clear();
        s.input.resize(n, 0.0);
        s.input.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_input_u8(n: usize) -> *mut u8 {
    LAB.with(|s| {
        let mut s = s.borrow_mut();
        s.input_u8.clear();
        s.input_u8.resize(n, 0);
        s.input_u8.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_out_f32_ptr(i: usize) -> *const f32 {
    LAB.with(|s| s.borrow().f32_out.get(i).map_or(core::ptr::null(), |v| v.as_ptr()))
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_out_f32_len(i: usize) -> usize {
    LAB.with(|s| s.borrow().f32_out.get(i).map_or(0, |v| v.len()))
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_out_u8_ptr() -> *const u8 {
    LAB.with(|s| s.borrow().u8_out.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_out_u8_len() -> usize {
    LAB.with(|s| s.borrow().u8_out.len())
}

/// Free the output buffers (after the caller copied them).
#[unsafe(no_mangle)]
pub extern "C" fn lab_release_outputs() {
    LAB.with(|s| {
        let mut s = s.borrow_mut();
        s.f32_out = [Vec::new(), Vec::new()];
        s.u8_out = Vec::new();
        s.input = Vec::new();
        s.input_u8 = Vec::new();
    })
}

// ------------------------------------------------------------------ the real-time rack

#[unsafe(no_mangle)]
pub extern "C" fn lab_rack_new(fs: f32) -> *mut Rack {
    Box::into_raw(Box::new(Rack::new(fs)))
}

/// # Safety
/// `h` must come from `lab_rack_new` and not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_rack_free(h: *mut Rack) {
    if !h.is_null() {
        drop(unsafe { Box::from_raw(h) });
    }
}

/// The rack's target parameter array (`N_PARAMS` f32 in `rack::KEYS` order); write, then the
/// rack glides to the new values.
///
/// # Safety
/// `h` must be a live rack.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_rack_params(h: *mut Rack) -> *mut f32 {
    unsafe { (*h).target.as_mut_ptr() }
}

#[unsafe(no_mangle)]
pub extern "C" fn lab_rack_n_params() -> u32 {
    N_PARAMS as u32
}

/// Clamp the targets into range after the host wrote them.
///
/// # Safety
/// `h` must be a live rack.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_rack_commit(h: *mut Rack) {
    let r = unsafe { &mut *h };
    let p = creature_lab::rack::RackParams::from_array(&r.target);
    r.set(&p);
}

/// Process `n` samples at `ptr` in place.
///
/// # Safety
/// `h` must be a live rack and `ptr..ptr+n` writable f32s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_rack_process(h: *mut Rack, ptr: *mut f32, n: usize) {
    let r = unsafe { &mut *h };
    let buf = unsafe { core::slice::from_raw_parts_mut(ptr, n) };
    r.process(buf);
}

/// # Safety
/// `h` must be a live rack.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lab_rack_level(h: *mut Rack) -> f32 {
    unsafe { (*h).level() }
}
