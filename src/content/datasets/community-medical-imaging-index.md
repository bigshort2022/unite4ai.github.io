---
name: Community Medical Imaging Index
summary: A curated index of openly licensed medical imaging datasets, each screened for license validity, consent basis, and documented population coverage.
maintainers: ["unite4ai-team"]
license: cc-by-4.0
collection_method: Manual curation of publicly published research datasets, each verified against its original license terms and publication record before inclusion.
consent: Institutional review board approval documented at the source dataset; no data is re-hosted by Unite4AI.
pii_review: true
bias_notes: Source datasets skew heavily toward North American and European hospital populations and adult patients. Pediatric and Global South representation is sparse — treat any model trained solely on this index as unvalidated for those groups.
artifacts: []
domains: ["healthcare", "medical-imaging"]
sdg_alignment: [3, 10]
community_led: true
updated: 2026-08-01
---

This index points to source datasets — it does not re-host them. Each entry records the original
license, the consent basis, the population described, and the known coverage gaps.

## Why an index instead of a mirror

Re-hosting medical data multiplies the number of parties holding sensitive material and the number
of ways consent terms can be violated. Pointing to the authoritative source with a verified
checksum gives researchers what they actually need — discoverability and integrity — without
creating a second copy of anything.

## How to add an entry

Open a dataset submission form. You will be asked for the license, the consent basis, whether a
PII review was completed, and what populations are under-represented. Entries missing any of these
cannot be merged — the schema rejects them.
