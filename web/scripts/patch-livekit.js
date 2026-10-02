const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../node_modules/livekit-client/dist/livekit-client.esm.mjs');

if (!fs.existsSync(targetFile)) {
    console.log('[patch-livekit] livekit-client not found, skipping patch.');
    process.exit(0);
}

let code = fs.readFileSync(targetFile, 'utf8');

// Check if already patched
if (code.includes('/* PATCHED_CONFORM_BUNDLED_CODEC_FMTP */')) {
    console.log('[patch-livekit] Already patched.');
    process.exit(0);
}

const originalFn = `function conformBundledCodecFmtp(media, isPlaceholder) {
  var _a, _b;
  // Canonical fmtp per payload type. Payload types are unique within a BUNDLE
  // group, so keying by payload alone (across audio and video) is safe. A real
  // section's value always takes precedence; otherwise the first placeholder
  // value seen is used so divergent placeholders still converge.
  const canonicalByPayload = new Map();
  const fromRealSection = new Set();
  for (const m of media) {
    const placeholder = isPlaceholder(m);
    for (const fmtp of (_a = m.fmtp) !== null && _a !== void 0 ? _a : []) {
      if (!placeholder) {
        canonicalByPayload.set(fmtp.payload, fmtp.config);
        fromRealSection.add(fmtp.payload);
      } else if (!canonicalByPayload.has(fmtp.payload)) {
        canonicalByPayload.set(fmtp.payload, fmtp.config);
      }
    }
  }
  if (canonicalByPayload.size === 0) {
    return;
  }
  // Conform placeholder sections to the canonical fmtp for each shared payload.
  for (const m of media) {
    if (!isPlaceholder(m)) {
      continue;
    }
    for (const fmtp of (_b = m.fmtp) !== null && _b !== void 0 ? _b : []) {
      const config = canonicalByPayload.get(fmtp.payload);
      if (config !== undefined && fmtp.config !== config) {
        fmtp.config = config;
      }
    }
  }
}`;

const patchedFn = `/* PATCHED_CONFORM_BUNDLED_CODEC_FMTP */
function conformBundledCodecFmtp(media, isPlaceholder) {
  var _a;
  const canonicalByPayload = new Map();
  const fromRealSection = new Set();
  for (const m of media) {
    const placeholder = isPlaceholder(m);
    for (const fmtp of (_a = m.fmtp) !== null && _a !== void 0 ? _a : []) {
      if (!placeholder) {
        canonicalByPayload.set(fmtp.payload, fmtp.config);
        fromRealSection.add(fmtp.payload);
      } else if (!canonicalByPayload.has(fmtp.payload)) {
        canonicalByPayload.set(fmtp.payload, fmtp.config);
      }
    }
  }
  if (canonicalByPayload.size === 0) {
    return;
  }
  // Conform ALL sections in the bundle sharing any payload type so libwebrtc never throws codec collision
  for (const m of media) {
    if (!m.rtp) continue;
    for (const rtp of m.rtp) {
      const canonicalConfig = canonicalByPayload.get(rtp.payload);
      if (canonicalConfig !== undefined) {
        if (!m.fmtp) m.fmtp = [];
        const existingFmtp = m.fmtp.find(f => f.payload === rtp.payload);
        if (existingFmtp) {
          existingFmtp.config = canonicalConfig;
        } else {
          m.fmtp.push({ payload: rtp.payload, config: canonicalConfig });
        }
      }
    }
  }
}`;

if (code.includes(originalFn)) {
    code = code.replace(originalFn, patchedFn);
    fs.writeFileSync(targetFile, code, 'utf8');
    console.log('[patch-livekit] Successfully patched livekit-client ESM bundle.');
} else {
    // Fallback regex replacement in case whitespace differs slightly
    const fnRegex = /function conformBundledCodecFmtp\s*\([^)]*\)\s*\{[\s\S]*?if\s*\(canonicalByPayload\.size\s*===\s*0\)[\s\S]*?\}\s*\}/;
    if (fnRegex.test(code)) {
        code = code.replace(fnRegex, patchedFn);
        fs.writeFileSync(targetFile, code, 'utf8');
        console.log('[patch-livekit] Successfully patched livekit-client ESM bundle via regex.');
    } else {
        console.warn('[patch-livekit] Warning: could not match conformBundledCodecFmtp pattern in ESM bundle.');
    }
}
