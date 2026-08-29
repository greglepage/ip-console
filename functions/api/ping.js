// Deliberately does nothing - the point is to measure round-trip time to the
// edge with as little server-side work as possible skewing the number.
export async function onRequestGet() {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
