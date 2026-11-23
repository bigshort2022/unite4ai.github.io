---
title: What an AI emissions estimate actually measures
summary: A worked example shows why a number needs a workload, a meter boundary, and an electricity source before it can tell us anything about climate impact.
author: unite4ai-team
published: 2026-11-23
tags: ["climate-energy-ai", "explainer", "measurement"]
---

Start with a meter, not a model name. Suppose a computer draws an average of 100 watts at the wall for two hours while running a batch of AI-assisted document summaries. It uses **0.20 kilowatt-hours**. How much carbon dioxide equivalent does that represent? The meter cannot tell you. That step needs another number: the emissions intensity of the electricity.

## Same work, different electricity

The two cases below keep the machine, workload, and elapsed time fixed. Only the assumed electricity changes. **These are invented teaching values, not measurements or estimates for a particular model, grid, or data center.**

| For one batch | Case A | Case B |
| --- | ---: | ---: |
| Electricity used (kWh) | 0.20 | 0.20 |
| Assumed electricity intensity (kg CO₂e/kWh) | 0.40 | 0.10 |
| Estimated emissions from that electricity (g CO₂e) | 80 | 20 |

Case A: `0.20 × 0.40 = 0.08 kg CO₂e`, or 80 grams. In Case B the estimate is one-quarter as large. **The computer did not get more efficient.** It used the same amount of electricity for the same job; only the assumed emissions per unit of electricity changed.

## What’s inside the number?

A wall meter tells you about what is plugged into it. In this example it would include the computer’s idle draw during the two hours, but not a separate cooling system, network equipment, or the energy and materials used to manufacture the machine. It would not include earlier model training. Those are exclusions, not zeros. For a fuller inventory, report them separately rather than quietly broadening the meaning of a two-hour reading.

A useful comparison also needs a definition of **finished work**. If a second system consumes less electricity but returns unusable summaries, the two workloads did not deliver the same result. Compare a fixed set of documents, score the summaries against the same acceptance criteria, and include energy spent on failures and retries. If you report energy per usable summary, publish the number accepted alongside it; if none pass, don’t report a per-success figure. An ordinary text search or a simpler local tool is a legitimate baseline.

## Read a data center number the same way

A permit application may report a proposed electrical capacity in **MW**; an annual filing may report electricity used in **MWh**. One is power, the other is energy over time. A proposed connection size is not a meter reading. Without actual operating time and load, it cannot tell you annual consumption. Neither figure, on its own, tells you how much electricity went to AI rather than other workloads. Link to the original record, say whether the number is proposed, reported, or measured, and leave the unknowns visible. [Berkeley Lab’s U.S. data center energy report](https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report.pdf) provides national context, not a reading for any single proposal.

The same distinction applies to the benefits side. A forecast that might let a building use less electricity is not avoided emissions until someone acts on it and checks the outcome against a credible baseline. Keep the footprint of running the system and the evidence of what it changes separate before attempting any net claim.

[Climate Change AI’s Summer School resources](https://www.climatechange.ai/events/summer_school2026/repository) put those two questions side by side: how machine learning can help with climate problems, and how to measure the footprint of using it. For a deeper lab, see Melanie Hanna and Andrés Felipe Perez Murcia’s [*Reducing your Climate Impact when Training ML Models*](https://doi.org/10.5281/zenodo.21828628). The example above is original and needs no account, notebook, or GPU.

The next time you see an AI emissions number, look for four things: **what work was done, what was metered, which electricity was assumed, and what was left out**. If you can’t find them, you don’t yet know what the number measures.
