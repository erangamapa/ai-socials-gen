const AUTH_COOKIE = "cb_auth";
const AUTH_SALT = "cb-forge-auth-v1";
const PBKDF2_ITERATIONS = 100_000;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = encoder.encode(AUTH_SALT);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashArray = Array.from(new Uint8Array(derived));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getAuthToken(password: string): Promise<string> {
  return hashPassword(password);
}

/** Constant-time string comparison safe for Edge Runtime (no Node.js crypto dependency). */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

export async function verifyAuthToken(
  password: string,
  token: string,
): Promise<boolean> {
  if (!password || !token) return false;
  const expected = await getAuthToken(password);
  return safeCompare(token, expected);
}

export { AUTH_COOKIE };
