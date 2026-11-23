# Homepage intent tabs

## Purpose

Give visitors three ways into Unite4AI: build and run open AI, learn how to participate in local data center decisions, or join the community. Adapt the tab-and-panel pattern from [Akash’s Community Welcome page](https://akash.network/community/welcome/), not its audience tiers, programs, branding, or assets.

## Placement and scope

On `/`, add **What do you want to do?** immediately after **Leading results** and before the open stack preview. The hero, its existing links, and the Leading results section stay unchanged; results still follow the hero when there are no current results. All other homepage sections, site navigation, and existing routes remain unchanged.

## Panel content

| Tab | Panel heading | Panel copy | Actions in order |
| --- | --- | --- | --- |
| Learn AI | Build with open AI. | Get hands-on: run an open model on your own machine. | **Build** → `/school/run-open-weights` |
| Learn AI Policy | Understand data center proposals near you. | Find out who decides, where to check claims about power, water, noise, and local costs, and how to raise concerns on the public record. | **Voice** → `/policy/data-centers` |
| Join | Take part in Unite4AI. | Share a model, dataset, or course, or meet people through public discussions and events. No contribution is required before saying hello. | **Contribution Guide** → `/contribute`; **Community** → `/community` |

All links are base-aware and open in the same tab. Community retains its existing public Discussions link when no events are scheduled. The homepage does not introduce membership rules, accounts, or sign-ups.

## Voice guide

Add a static guide at `/policy/data-centers` titled **Local data centers: learn and speak up**. It is a civic resource, not a list of live proposals or a channel for filing comments. It must explain:

1. How to locate the project file, public notices, dates, and the decision-making body using official municipal, county, or other relevant planning and permitting sources.
2. Which project claims to check in the record: electricity demand and who pays for upgrades, water use and cooling, noise and backup generators, and local jobs, incentives, and public costs. Separate applicant estimates from agency findings and enforceable permit conditions.
3. How to find the official comment channel and deadline, write a specific evidence-backed concern or question, ask for a concrete response or condition, and keep a copy. Note that comments may be public and procedures vary by jurisdiction.

The guide includes an example comment prompt without presenting hypothetical impacts as facts. It does not collect personal data, submit comments, or assume a visitor’s location.

## Interaction

- The tab row is ordered Learn AI, Learn AI Policy, Join. On initial load, Learn AI is selected. Clicking or tapping another tab reveals its single matching panel without navigation or a network request. Selection is local to the page and is not persisted.
- Expose a named tablist and programmatic relationships between tabs and their panels. Only the selected tab is in the tab order. Left and Right Arrow move focus and selection, wrapping at either end. Home and End select the first and last tab. Tab from the selected tab reaches the first link in its panel, then the remaining link if there is one. Inactive links are not focusable or exposed to assistive technology. The active state and keyboard focus are visibly distinct.
- Without JavaScript, show the three headed panels and all four links in reading order, with no inoperative tab controls. The copy and all destinations are available in the static HTML.

## Visual direction

Use the approved prototype’s single panel, with text and actions on the left and original, decorative artwork on the right. Use Unite4AI’s existing palette, type, borders, and focus treatment rather than copying Akash assets. On narrow screens the three controls remain easy to tap, actions can wrap, and the text is a single column; decorative artwork can be omitted. The section must not add horizontal page scrolling. No dependency, external asset request, API, or analytics is required.

## Acceptance

- On the rendered homepage, the hero is still followed by Leading results, then the new section. All four actions land on their specified destinations, including the new Voice guide.
- In a desktop browser and at a narrow mobile viewport, switching tabs reveals exactly one panel; keyboard focus, arrow navigation, and action order behave as described. With scripts disabled, all four links remain reachable.
- No benchmark data, result selection rules, or existing routes change.
