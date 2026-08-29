// Everything here except the PTR lookup comes straight from Cloudflare's edge -
// every request through Cloudflare Pages carries a `cf` object with geolocation,
// ASN, and TLS/protocol details attached by the datacenter that terminated the
// connection. No external geolocation API, no rate limits, no signup.
//
// NOTE: `request.cf` is only real when actually served by Cloudflare's edge.
// Local `wrangler pages dev` fills it with placeholder values, so this only
// reports accurately once deployed.

const HOSTING_KEYWORDS = [
  "amazon", "aws", "google", "microsoft", "azure", "digitalocean", "linode",
  "akamai", "ovh", "hetzner", "vultr", "oracle", "alibaba", "tencent", "ibm cloud",
  "cloudflare", "fastly", "leaseweb", "choopa", "contabo", "scaleway", "cloudflare warp",
  "nordvpn", "expressvpn", "protonvpn", "mullvad", "surfshark", "private internet access",
  "datacamp", "m247", "psychz", "colocrossing", "hivelocity",
];

function looksLikeHosting(asOrganization) {
  if (!asOrganization) return false;
  const lower = asOrganization.toLowerCase();
  return HOSTING_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseUserAgent(ua) {
  if (!ua) return { browser: "Unknown", os: "Unknown" };

  let os = "Unknown";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua)) {
    const m = /mac os x ([\d_]+)/i.exec(ua);
    os = "macOS" + (m ? " " + m[1].replace(/_/g, ".") : "");
  } else if (/android/i.test(ua)) {
    const m = /android ([\d.]+)/i.exec(ua);
    os = "Android" + (m ? " " + m[1] : "");
  } else if (/iphone|ipad/i.test(ua)) {
    const m = /os ([\d_]+) like mac/i.exec(ua);
    os = (/ipad/i.test(ua) ? "iPadOS" : "iOS") + (m ? " " + m[1].replace(/_/g, ".") : "");
  } else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge " + (/edg\/([\d.]+)/i.exec(ua)?.[1] || "");
  else if (/opr\//i.test(ua)) browser = "Opera " + (/opr\/([\d.]+)/i.exec(ua)?.[1] || "");
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome " + (/chrome\/([\d.]+)/i.exec(ua)?.[1] || "");
  else if (/firefox\//i.test(ua)) browser = "Firefox " + (/firefox\/([\d.]+)/i.exec(ua)?.[1] || "");
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = "Safari " + (/version\/([\d.]+)/i.exec(ua)?.[1] || "");

  return { browser: browser.trim(), os };
}

function reverseIPv4Name(ip) {
  return ip.split(".").reverse().join(".") + ".in-addr.arpa";
}

function reverseIPv6Name(ip) {
  // Expand :: shorthand, then reverse every hex nibble per RFC 3596.
  let [head, tail] = ip.split("::");
  let headParts = head ? head.split(":") : [];
  let tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const zeros = ip.includes("::") ? new Array(Math.max(missing, 0)).fill("0") : [];
  const groups = [...headParts, ...zeros, ...tailParts].map((g) => g.padStart(4, "0"));
  const nibbles = groups.join("").split("").reverse().join(".");
  return nibbles + ".ip6.arpa";
}

async function reversePtr(ip, isV6) {
  try {
    const name = isV6 ? reverseIPv6Name(ip) : reverseIPv4Name(ip);
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=PTR`, {
      headers: { accept: "application/dns-json" },
    });
    const data = await res.json();
    const hostnames = (data.Answer || []).map((a) => a.data.replace(/\.$/, ""));
    return { found: hostnames.length > 0, hostnames };
  } catch {
    return { found: false, hostnames: [] };
  }
}

export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const isV6 = ip.includes(":");
  const ua = request.headers.get("user-agent") || "";

  const ptr = ip !== "unknown" ? await reversePtr(ip, isV6) : { found: false, hostnames: [] };
  const { browser, os } = parseUserAgent(ua);

  return json({
    ip,
    ipVersion: isV6 ? "IPv6" : "IPv4",
    city: cf.city || null,
    region: cf.region || null,
    regionCode: cf.regionCode || null,
    postalCode: cf.postalCode || null,
    country: cf.country || null,
    continent: cf.continent || null,
    timezone: cf.timezone || null,
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    colo: cf.colo || null,
    asn: cf.asn || null,
    asOrganization: cf.asOrganization || null,
    httpProtocol: cf.httpProtocol || null,
    tlsVersion: cf.tlsVersion || null,
    tlsCipher: cf.tlsCipher || null,
    likelyHosting: looksLikeHosting(cf.asOrganization),
    ptr,
    browser,
    os,
    userAgent: ua,
  });
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
