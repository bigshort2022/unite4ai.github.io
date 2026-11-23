# Homepage intent tabs

## Purpose

Help a visitor take a concrete next step on Unite4AI: learn, contribute, or meet people. Adapt the tab-and-panel pattern from [Akash’s Community Welcome page](https://akash.network/community/welcome/), not its audience tiers, programs, branding, or assets. Someone who wants to learn or say hello does not need to identify as an expert or become a member.

## Placement and scope

On `/`, add **What do you want to do?** immediately after **Leading results** and before the open stack preview. The hero, its existing links, and the Leading results section stay unchanged; results still follow the hero when there are no current results. All other homepage sections, site navigation, and existing routes remain unchanged.

## Panel content

| Tab | Panel heading | Panel copy | Action | Destination |
| --- | --- | --- | --- | --- |
| Learn | Learn AI by doing it. | Start with the basics or run your first open model. The Open School is free, with no account required. | Browse free courses | `/school` |
| Contribute | Make something here better. | Add a model or dataset, share a course, or help with translation and accessibility. You don’t need to know Git to start. | See ways to contribute | `/contribute` |
| Meet people | Find people working on open AI. | See workshops and office hours, or ask a question in public Discussions. You don’t need to contribute before saying hello. | Explore the community | `/community` |

All links are base-aware, same-tab site links. Meet people always links to Community: visitors can find the existing Discussions link even when no events are scheduled. The homepage does not introduce membership rules, accounts, or sign-ups.

## Interaction

- The tab row is ordered Learn, Contribute, Meet people. On initial load, Learn is selected. Clicking or tapping another tab reveals its single matching panel without navigation or a network request. Selection is local to the page and is not persisted.
- Expose a named tablist and programmatic relationships between tabs and their panels. Only the selected tab is in the tab order. Left and Right Arrow move focus and selection, wrapping at either end. Home and End select the first and last tab. Tab from the selected tab reaches that panel’s link; inactive links are not focusable or exposed to assistive technology. The active state and keyboard focus are visibly distinct.
- Without JavaScript, show the three headed panels and links in reading order, with no inoperative tab controls. The copy and all destinations are available in the static HTML.

## Visual direction

Use the approved prototype’s single panel, with text and one CTA on the left and original, decorative artwork on the right. Use Unite4AI’s existing palette, type, borders, and focus treatment rather than copying Akash assets. On narrow screens the three controls remain easy to tap and the text is a single column; decorative artwork can be omitted. The section must not add horizontal page scrolling. No dependency, external asset request, API, or analytics is required.

## Acceptance

- On the rendered homepage, the hero is still followed by Leading results, then the new section. The three actions land on their existing destinations.
- In a desktop browser and at a narrow mobile viewport, switching tabs reveals exactly one panel; keyboard focus, arrow navigation, and the panel’s link behave as described. With scripts disabled, all three links remain reachable.
- No benchmark data, result selection rules, or existing routes change.
