# Respin: website, UI/UX and design-system brief

## The assignment

Review and redesign Respin's public website and creator web app. Improve how people understand the product, find their way around, complete tasks, and work with generated content. Develop a consistent visual identity and reusable design system across the experience.

The visual direction is open. Please recommend the style, typography, colour, imagery, layout and interaction approach you believe best suits the product and its users. The general requirements are clarity, ease of use, readability, accessibility and consistency.

## Product and audience

Respin helps short-form video creators turn ideas, source material and descriptions of footage into hooks, scripts, captions and filming plans, using their own writing preferences and content strategy.

The primary user is an independent creator who plans, films and publishes their own content. Secondary users include creators working with an editor or assistant, and operators working across several creator profiles. Small businesses and coaches are also represented in the current website's audience pages.

The main user need is to move from “What should I make?” to a usable draft they can review and film, without losing their own voice. Users may plan on desktop and consult their work on a phone.

## Feature scope

This is an inventory for the redesign, based on the current working product. Availability varies by subscription, permissions and rollout. Include those states in the design; this inventory does not mean every capability is publicly available.

| Area | Features and tasks to cover |
|---|---|
| **Public website** | Explain the product, show how it works, present examples, compare plans and guide visitors into signup. Include the main landing page, audience variants for women creators, small businesses and coaches, changelog, and terms/privacy page layout. The example area supports an illustrative preview or an enabled Sample Spin demo. |
| **Account entry** | Sign up, sign in, optional Google sign-in when enabled, and sign out. Make the transition from signup into setup clear. |
| **Creator setup** | Create and select a creator profile; add examples of the creator's own writing; add reference posts separately; answer a resumable interview about audience, positioning, goals and preferences; review proposed writing rules; complete the first-ideas step. Show progress and the next action. |
| **Creator Brain** | Review and edit the creator's voice rules, strategy and personal quality checks, currently called the “kill test.” Show supporting evidence, drafts, confirmations, active versions and history. Include the declared success metric, performance information, proposal history, and JSON/Markdown export. |
| **Studio** | Choose a content task, supply inputs, select a platform, see the credit cost, generate content, review the result, request a revision and leave structured feedback. Support the modes listed below and the current session's revision chain. Saved draft data is available in the JSON export; a persistent in-app history browser would be an enhancement. |
| **Framework library** | Browse shared content frameworks and manage permitted private frameworks. A framework describes the structure or mechanism behind a piece of content. Make it easy to understand and distinguish shared and creator-specific material. |
| **Trends and Spin** | Track a niche, browse available reference content, inspect its structural breakdown, submit a video URL with pasted transcript for analysis, and use Spin to draft an original adaptation. Include available source/context information, queued analysis, unavailable evidence and near-copy refusals. |
| **Results** | After declaring a success metric, log a published post's outcome and relevant context, review its history and evidence status, and understand comparison/proposal availability. Include the conditional comparison and Brain-update review screens. Distinguish reach from conversion and paid from organic results. |
| **Plans, billing and usage** | Compare Free, Creator, Pro and Studio plans; view credit balance, usage and history; manage a subscription, credit packs and optional auto-top-up; pause, resume or cancel; access invoices/payment management and recover incomplete payments. |
| **Account and data controls** | Understand data/export options, billing-contact responsibility, account or workspace deletion availability, pending deletion and cancellation/recovery where supported. Clearly explain consequential actions. |

### Studio modes

The product's seven content tasks are:

- **Footage to Thesis:** turn descriptions of available footage into a central idea and a script with a shot map.
- **Idea to Script:** develop an idea into a structured script and filming plan.
- **Source to Reel:** develop supplied source material into a short-form script.
- **Analyse and Spin:** break down a reference and adapt its underlying structure to the creator's own material.
- **Hooks:** generate opening lines to explore.
- **Caption:** draft accompanying post copy.
- **Ideation:** generate content ideas with an opening, point and framework.

Depending on the task, outputs include hooks, script beats, shot suggestions, on-screen text and captions. They also include an explanation, quality-check findings, details the creator needs to verify, and the draft's weakest point. These need to be readable without overwhelming the main content.

### Secondary internal scope

There are internal screens for runtime configuration, model spending and signup/activation reporting. Account for these when defining reusable components, but prioritise the public website and creator workflows for detailed design.

## Journeys to prioritise

1. **New visitor to first useful output:** understand Respin → sign up → set up a creator → review and activate their Brain → generate first ideas.
2. **Returning creator to usable draft:** select the right creator → choose a Studio task → supply input → generate → review → revise.
3. **Reference to original content:** discover or submit a reference → understand its breakdown → Spin it into the creator's context → review the result.
4. **Published content to reflection:** log an outcome → understand what the available evidence can show → see why comparisons are unavailable, or review an eligible proposal when supported.
5. **Managing access and spending:** understand a limit or blocked action → see the relevant balance, permission or plan → take a clear next step.

Please assess the navigation, terminology, page grouping and step sequence. The existing screen structure is a starting point; propose changes where they make these journeys easier.

## UX requirements

- Make the current task, selected creator and next useful action easy to identify.
- Keep setup approachable and explain why information is needed. Support returning to unfinished work.
- Make long scripts, evidence and history easy to scan and read on desktop and mobile.
- Show costs, limits and consequential changes before the user commits.
- Explain unfamiliar product terms in plain language; recommend clearer labels where helpful.
- Design empty, loading, success, validation, failure, unavailable, read-only and plan-limited states alongside normal screens. Give users a useful next step when something fails.
- Support keyboard navigation, visible focus, readable contrast, clear labels, touch interaction and reduced-motion preferences. Do not communicate status through colour alone.

## Product behaviour to preserve

- The creator reviews and approves changes to their Brain; a suggested update is distinct from an active one.
- The creator's own writing and other people's references have different purposes. Reference material must not be presented as the creator's personal voice.
- Missing personal facts remain marked for checking. Outputs and quality checks must not imply guaranteed originality or performance.
- Manual results are self-reported. Numerical learning and related proposals require eligible connector-verified evidence; do not imply that automated analytics connections or performance improvement are already available.
- Studio feedback is currently stored for review; it does not automatically change future drafts or the Brain.
- Separate creator profiles must remain clearly distinguishable throughout the experience.
- Prices, allowances and available actions come from the product. Use labelled sample data in designs and allow for changing values.

The current footage workflow uses text descriptions; do not assume video upload, editing or automatic publishing. Team invitations/seat management, analytics integrations and expanded admin curation should be treated as future scope unless separately confirmed. The Sample Spin demo and deletion actions also have availability conditions.

## Design system and deliverables

Please provide:

- A concise UX review with prioritised issues and opportunities, based on walking through the product.
- A proposed information architecture and the main user flows.
- A visual direction, followed by responsive designs for the priority journeys and their important states.
- A reusable design system covering typography, semantic colours, spacing, layout, icons, interaction and motion, with accessible component variants and states.
- Components for navigation, forms, buttons, selectors, notifications, content documents, evidence/proposals, tables, usage displays and plan comparisons.
- An editable design file, a clickable prototype of the main journeys, and implementation notes covering responsive behaviour, components, tokens and interactions.

Validate the proposal through task walkthroughs or usability testing. A successful redesign should help a new user explain the product, complete setup, generate and revise content, understand what needs checking, and recognise costs or limits with little assistance.

## Reference material

Use the running product and representative content as the primary design reference. The existing visual system is context for the redesign, not a prescribed aesthetic for this brief.

Repository references for the product owner and implementation handoff:

- [Product requirements](../initial/PRD.md)
- [Current design system](../../respin/DESIGN.md)
- [Public website](../../respin/app/%28marketing%29/page.tsx) and [creator navigation](../../respin/app/%28product%29/nav.tsx)
- [Creator setup](../../respin/app/%28product%29/onboarding/onboarding-view.tsx) and [Brain](../../respin/app/%28product%29/brain/brain-view.tsx)
- [Studio](../../respin/app/%28product%29/studio/studio-panel.tsx), [Trends](../../respin/app/%28product%29/trends/trends-view.tsx) and [Results](../../respin/app/%28product%29/results/results-view.tsx)
- [Billing](../../respin/app/%28product%29/settings/billing/billing-view.tsx), [Usage](../../respin/app/%28product%29/usage/usage-view.tsx) and [Account](../../respin/app/%28product%29/settings/account/account-view.tsx)
