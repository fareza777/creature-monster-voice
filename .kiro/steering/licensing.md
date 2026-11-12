---
inclusion: fileMatch
fileMatchPattern: ['**/package.json', '**/Cargo.toml', 'THIRD_PARTY_NOTICES.md', 'public/**']
---

# Licensing and attribution

- The app is MIT-licensed (© 2026 F7 Developer). Upstream CHIMERA is MIT (© 2026 Jameson Hodge);
  its licence text lives at `third_party/chimera/LICENSE` and is shown in the in-app About screen.
- Every new dependency must be added to `THIRD_PARTY_NOTICES.md` with its licence before merge.
  Allowed: MIT, BSD, Apache-2.0, ISC, OFL (fonts), Zlib, CMU dict licence.
  LGPL is allowed only for unmodified JS libraries loaded as a separate replaceable chunk
  (lamejs) — document how to replace it.
- No GPL code, no copyrighted samples, no recorded voices in the repository.
- Files adapted from upstream keep a header: `Adapted from CHIMERA (MIT) — <original path>`.
- `CONTRIBUTIONS.md` lists what is original to this project versus inherited.
