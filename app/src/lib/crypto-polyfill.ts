// React Native's Hermes runtime has no `crypto` global at all, so
// @supabase/auth-js's generatePKCEChallenge() fails its support check
// (`crypto` + `crypto.subtle` + `TextEncoder`) and silently downgrades the
// PKCE code challenge from S256 to `plain` — sending the verifier unhashed
// and defeating the interception protection PKCE exists to provide. It warns
// but still succeeds, so this is easy to ship without noticing.
//
// This installs the minimum surface auth-js actually touches: subtle.digest
// for SHA-256, backed by expo-crypto, plus getRandomValues. It is NOT a
// general-purpose WebCrypto implementation — anything needing encryption,
// signing, or key management should use a real polyfill
// (react-native-quick-crypto), which needs a dev build since it's a native
// module and doesn't run in Expo Go.
//
// Import this BEFORE creating the Supabase client (see ./supabase.ts): the
// support check runs at call time, but ordering keeps the dependency obvious.
import * as ExpoCrypto from 'expo-crypto';

type GlobalWithCrypto = typeof globalThis & { crypto?: Partial<Crypto> };

const g = globalThis as GlobalWithCrypto;

function toDigestAlgorithm(algorithm: AlgorithmIdentifier): ExpoCrypto.CryptoDigestAlgorithm {
  const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
  switch (name) {
    case 'SHA-256':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
    case 'SHA-384':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA384;
    case 'SHA-512':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA512;
    case 'SHA-1':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA1;
    default:
      // Better to fail loudly than to hand back a wrong-algorithm digest.
      throw new Error(`crypto.subtle.digest: unsupported algorithm "${name}"`);
  }
}

export function polyfillCrypto(): void {
  if (!g.crypto) {
    Object.defineProperty(g, 'crypto', { value: {}, configurable: true, writable: true });
  }

  const crypto = g.crypto as Partial<Crypto> & { subtle?: Partial<SubtleCrypto> };

  if (typeof crypto.getRandomValues !== 'function') {
    crypto.getRandomValues = ExpoCrypto.getRandomValues as Crypto['getRandomValues'];
  }

  if (!crypto.subtle) {
    Object.defineProperty(crypto, 'subtle', {
      value: {},
      configurable: true,
      writable: true,
    });
  }

  const subtle = crypto.subtle as Partial<SubtleCrypto>;
  if (typeof subtle.digest !== 'function') {
    subtle.digest = ((algorithm: AlgorithmIdentifier, data: BufferSource) =>
      ExpoCrypto.digest(toDigestAlgorithm(algorithm), data)) as SubtleCrypto['digest'];
  }
}
