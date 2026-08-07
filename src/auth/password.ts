/**
 * 账密登录的口令处理。
 *
 * 说清楚这件事的边界：**纯静态站做不了真正的认证**。没有服务端，
 * 就没有「服务端校验」这一步 —— 校验发生在浏览器里，改一改前端代码就能绕过。
 * 所以这里的口令只解决一件事：**别让口令以明文躺在别人的电脑上**
 * （共用机器、浏览器同步、导出的账套 JSON 都可能被看到）。
 *
 * 用 WebCrypto 的 PBKDF2-SHA256，随机盐，120k 轮 —— 跟真后端一个做法，
 * 将来把 verify 换成一次 POST 就完成了迁移，其余代码不用动。
 */

const ITERATIONS = 120_000;
const KEY_LEN = 32;

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_LEN * 8,
  );
  return toHex(bits);
}

/** 存成 `pbkdf2$轮数$盐$摘要`，跟 shadow 文件一个格式，一眼看得出用了什么 */
export async function hashPassword(password: string, salt?: Uint8Array) {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, s, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(s.buffer as ArrayBuffer)}$${digest}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterStr, saltHex, digest] = stored.split("$");
  if (scheme !== "pbkdf2" || !saltHex || !digest) return false;
  const got = await derive(password, fromHex(saltHex), Number(iterStr) || ITERATIONS);
  // 长度一致时做定时安全比较。浏览器端的意义有限，但没有理由写得更差。
  if (got.length !== digest.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ digest.charCodeAt(i);
  return diff === 0;
}

export function passwordIssue(pw: string): string | null {
  if (pw.length < 6) return "口令至少 6 位";
  if (pw.length > 128) return "口令太长了";
  return null;
}
