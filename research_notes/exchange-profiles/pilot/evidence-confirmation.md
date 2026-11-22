<!-- Pilot record for Task 8 of docs/superpowers/plans/2026-11-22-exchange-profiles.md. Written by omp agents (claude-opus-5-5); controller notes. -->

# Pilot evidence confirmation (after literal-review fixes, 2026-11-22)

`profile:verify` (plain fetch, Markdown then HTML, declared User-Agent) confirmed every quote not listed below. Listed quotes were re-checked with a headless browser (rendered text) or `pdftotext`, using the same matcher.

| Profile | Evidence | URL | Method | Result |
|---|---|---|---|---|
| akash | — | — | profile:verify | {"id":"akash","evidence":30,"failed":13,"manual":2} |
| akash | e1 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e2 | https://www.sec.gov/Archives/edgar/data/1734871/000173487118000003/xslFormDX01/primary_doc.xml | browser-rendered | confirmed |
| akash | e3 | https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001734871&owner=include&count=40 | browser-rendered | confirmed |
| akash | e5 | https://www.sec.gov/Archives/edgar/data/1734871/000173487118000003/xslFormDX01/primary_doc.xml | browser-rendered | confirmed |
| akash | e7 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e8 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e10 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e13 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e14 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e31 | https://coinmarketcap.com/currencies/akash-network/ | browser-rendered | live value changed since retrieval: confirm by eye |
| akash | e32 | https://coinmarketcap.com/currencies/akash-network/ | browser-rendered | live value changed since retrieval: confirm by eye |
| akash | e65 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| akash | e103 | https://console.akash.network/terms-of-service | browser-rendered | confirmed |
| olas | — | — | profile:verify | {"id":"olas","evidence":38,"failed":8,"manual":5} |
| olas | e1 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| olas | e2 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| olas | e3 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| olas | e31 | https://coinmarketcap.com/currencies/autonolas/ | browser-rendered | live value changed since retrieval: confirm by eye |
| olas | e32 | https://coinmarketcap.com/currencies/autonolas/ | browser-rendered | live value changed since retrieval: confirm by eye |
| olas | e99 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| olas | e103 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| olas | e107 | https://www.valory.xyz/mech-terms.pdf | pdftotext | confirmed |
| x402 | — | — | profile:verify | {"id":"x402","evidence":38,"failed":3,"manual":2} |
| x402 | e3 | https://raw.githubusercontent.com/x402-foundation/x402/main/foundation/x402%20Technical%20Charter%20March%2031%2C%202026.pdf | pdftotext | confirmed |
| x402 | e94 | https://raw.githubusercontent.com/x402-foundation/x402/main/contracts/evm/audits/cantina_x402_may2026.pdf | pdftotext | confirmed |
| x402 | e107 | https://raw.githubusercontent.com/x402-foundation/x402/main/contracts/evm/audits/cantina_x402_may2026.pdf | pdftotext | confirmed |

Certificate items are `manual`: produced by one `profile:passive` run per official URL during research (Akash akash.network; Olas marketplace.olas.network; x402 x402.org).
