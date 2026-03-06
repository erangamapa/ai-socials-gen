const AUTH_COOKIE = "cb_auth";
const AUTH_SALT = "cb-forge-auth-v1";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(AUTH_SALT + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getAuthToken(password: string): Promise<string> {
  return hashPassword(password);
}

export async function verifyAuthToken(
  password: string,
  token: string
): Promise<boolean> {
  if (!password || !token) return false;
  const expected = await getAuthToken(password);
  return token === expected;
}

export { AUTH_COOKIE };
