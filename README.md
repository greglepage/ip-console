# ip report

**ip.greglepage.com** — a zero-input connection report for remote troubleshooting. Land on the page and immediately see the public IP, geolocation, ASN/network, TLS and HTTP protocol details, reverse DNS, and browser/OS for whoever's currently connected.

All geolocation, network, and TLS data comes directly from Cloudflare's edge (`request.cf`) — no external geolocation API, no rate limits, no signup. Reverse DNS is a live DNS-over-HTTPS query. Nothing is logged or stored.

Deployed via Cloudflare Pages, connected to this repo.
