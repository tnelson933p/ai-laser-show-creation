---
name: AI show agent token limit
description: Why the AI show director needs 16000 tokens and gpt-5 for full-song coverage
---

The laser show AI director (`artifacts/api-server/src/routes/laser.ts`) generates a `sequence` array where each scene contains `animationCode` (JavaScript canvas drawing code, ~200-500 chars per scene) plus ~10 other fields.

**Why 5000 tokens was wrong:**
Each scene eats ~400 tokens. At 5000 tokens, the model fits 8-10 scenes before truncating the JSON mid-response. A 4-minute song at 120 BPM = 120 bars. 10 scenes × 4 bars = only 40 bars covered = ~1 minute of show. The sequencer holds the last scene for the remainder, causing repetition.

**Fix applied:**
- Model: `gpt-4o` → `gpt-5`, analyze endpoint: `gpt-4o-mini` → `gpt-5-mini`
- `max_tokens`: 5000 → 16000
- Prompt now explicitly states total bar count and requires scenes to sum to full song length
- Removed "6-12 scenes" cap; new rule: "create as many as needed (8-30 scenes)"

**Why:** Full 4-minute song needs 14-20 scenes; 3-minute needs 12-16. Without 16000 tokens the JSON truncates and the show dies ~1 minute in.

**How to apply:** If show truncation returns, check `max_tokens` first before debugging prompt logic.
