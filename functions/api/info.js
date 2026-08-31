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

// RFC 6598 (100.64.0.0/10) is the carrier-grade NAT range ISPs use to share
// one public IP across many customers - a real, common reason port forwarding
// and inbound connections silently fail even though "the internet works fine."
function isCgnat(ip) {
  const m = /^(\d+)\.(\d+)\./.exec(ip);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 100 && b >= 64 && b <= 127;
}

// Flag emoji render as bare letters on a lot of Windows font configurations,
// so use a small flag image instead - reliable everywhere.
function countryFlagUrl(countryCode) {
  if (!countryCode || countryCode.length !== 2) return null;
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`;
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

const WEATHER_CODES = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};

async function getWeather(lat, lon) {
  if (lat === undefined || lon === undefined) return null;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph`
    );
    const data = await res.json();
    if (!data.current_weather) return null;
    return {
      tempF: data.current_weather.temperature,
      windMph: data.current_weather.windspeed,
      description: WEATHER_CODES[data.current_weather.weathercode] || null,
    };
  } catch {
    return null;
  }
}

function vcardField(vcardArray, field) {
  if (!Array.isArray(vcardArray) || !Array.isArray(vcardArray[1])) return null;
  const entry = vcardArray[1].find((e) => e[0] === field);
  return entry ? entry[3] : null;
}

function findEntityEmail(entities, role) {
  if (!Array.isArray(entities)) return null;
  for (const e of entities) {
    if (Array.isArray(e.roles) && e.roles.includes(role)) {
      const email = vcardField(e.vcardArray, "email");
      if (email) return email;
    }
    const nested = findEntityEmail(e.entities, role);
    if (nested) return nested;
  }
  return null;
}

// rdap.org resolves to the correct Regional Internet Registry (ARIN, RIPE,
// APNIC, ...) for this specific address - the network block it was allocated
// in, who holds it, and who to contact about abuse from it.
async function getIpRdap(ip) {
  try {
    const res = await fetch(`https://rdap.org/ip/${ip}`, {
      headers: { accept: "application/rdap+json", "user-agent": "ip.greglepage.com (RDAP client)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cidr = data.cidr0_cidrs && data.cidr0_cidrs[0];
    const registryHost = new URL(res.url).hostname;
    const registry = /arin/.test(registryHost) ? "ARIN"
      : /ripe/.test(registryHost) ? "RIPE NCC"
      : /apnic/.test(registryHost) ? "APNIC"
      : /lacnic/.test(registryHost) ? "LACNIC"
      : /afrinic/.test(registryHost) ? "AFRINIC"
      : registryHost;
    return {
      networkName: data.name || null,
      networkCidr: cidr ? `${cidr.v4prefix || cidr.v6prefix}/${cidr.length}` : (data.startAddress && data.endAddress ? `${data.startAddress} - ${data.endAddress}` : null),
      registry,
      abuseEmail: findEntityEmail(data.entities, "abuse"),
    };
  } catch {
    return null;
  }
}

export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const isV6 = ip.includes(":");
  const ua = request.headers.get("user-agent") || "";

  const [ptr, weather, ipRdap] = await Promise.all([
    ip !== "unknown" ? reversePtr(ip, isV6) : Promise.resolve({ found: false, hostnames: [] }),
    cf.latitude && cf.longitude ? getWeather(cf.latitude, cf.longitude) : Promise.resolve(null),
    ip !== "unknown" ? getIpRdap(ip) : Promise.resolve(null),
  ]);
  const { browser, os } = parseUserAgent(ua);

  return json({
    ip,
    ipVersion: isV6 ? "IPv6" : "IPv4",
    city: cf.city || null,
    region: cf.region || null,
    regionCode: cf.regionCode || null,
    postalCode: cf.postalCode || null,
    country: cf.country || null,
    countryFlagUrl: countryFlagUrl(cf.country),
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
    cgnat: !isV6 && ip !== "unknown" ? isCgnat(ip) : false,
    ptr,
    weather,
    ipRdap,
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
