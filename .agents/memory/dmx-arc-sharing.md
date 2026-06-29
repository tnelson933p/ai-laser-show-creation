---
name: DMX Arc sharing pattern
description: How Tauri AppState atomics must be Arc-wrapped so background threads share them
---

In `laser-show/src-tauri/src/main.rs`, `AppState` fields used by both Tauri commands AND background threads must be `Arc<Atomic*>`, not plain `Atomic*`.

**The bug pattern (wrong):**
```rust
struct AppState { playback_running: AtomicBool, current_frame: AtomicU64 }
// In start_playback:
let running = Arc::new(AtomicBool::new(true)); // LOCAL Arc — nobody else can reach it
let running_clone = Arc::clone(&running);       // thread gets this
state.playback_running.store(true, ...);        // different atomic!
// stop_playback sets state.playback_running = false → thread never sees it
```

**The fix (correct):**
```rust
struct AppState { playback_running: Arc<AtomicBool>, current_frame: Arc<AtomicU64> }
// In start_playback:
let running = Arc::clone(&state.playback_running); // same Arc as state
// Thread checks running.load() — stop_playback writes to same Arc ✓
```

**Why:** Tauri's `State<T>` wraps `AppState` in an Arc internally, but the fields themselves need to be Arc-wrapped so a clone of the field (given to a thread) points to the same atomic as commands like `stop_playback` that receive `State<AppState>`.

**How to apply:** Any field in `AppState` that a spawned thread needs to read or write must be `Arc<Atomic*>` — not plain `Atomic*`.
