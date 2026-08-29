// Drains whatever the client sends and reports how many bytes arrived - the
// client measures its own upload duration via XHR progress events, this just
// needs to actually receive the data rather than reject it early.
export async function onRequestPost({ request }) {
  const reader = request.body.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
  }
  return new Response(JSON.stringify({ received: total }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
