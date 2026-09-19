# Respin — dual-theme prototype handoff

**Version 5 · 19 September 2026**  
**Deliverables:** `Respin_Visual_Prototype.html` and this Markdown handoff.  
**Status:** implemented interactive front-end prototype; not a deployed product release.

## 1. What this revision delivers

The HTML has been redesigned in the two visual directions approved in the conversation:

- **Colour Pop:** a light, colourful creator workspace with pastel panels, violet-to-pink accents, glossy category icons, playful annotations and a compact headphones mascot.
- **After Hours:** the same workspace and interactions on deep navy surfaces, with restrained luminous accents, tinted cards and brighter selected states.

These are two themes of one interface, not separate applications. Switching themes keeps the current screen, result tab, selected scene and entered brief intact. **Colour Pop is the initial default.** Where browser storage permits, the chosen theme is remembered.

The former **Original / Current UI comparison is removed** from the prototype’s navigation, document payload and routing. The supplied historical UI is not bundled behind a hidden switch.

This is an actual HTML/CSS/JavaScript deliverable. Text, buttons, fields, tabs, scene selectors and dialogs are browser elements, not an image with clickable hotspots. The interface includes embedded SVG illustrations; it does not use the approved dashboard pictures as page backgrounds or replace the application with screenshots.

### Working basis

| Material | Role in this revision |
|---|---|
| The supplied `Respin_Visual_Prototype.html` and Version 4 handoff | Starting templates, sample data, local rendering adapter and interaction structure. |
| `Respin Redesign.dc.html` | Underlying Studio routes, result views, reference steps, Brain sections and sample copy. |
| `Respin Landing.dc.html` | Landing-page content and section order, as already adapted in Version 4. |
| The approved colourful and dark concepts | Visual direction: layered colour, rounded shapes, expressive icons, mascot and annotations. Not authority for new capabilities or pricing. |
| `respin-designer-brief.md` and the 9 September system snapshot | Product boundaries already recorded in Version 4: approved context, credit operations, bounded checks, text-based footage input and evidence limitations. |

The `.dc.html` source resources and the product repository have not been modified. This revision replaces the two requested handoff artifacts only.

## 2. Open and explore

Save `Respin_Visual_Prototype.html` and open it in a modern browser with JavaScript enabled. It is self-contained: CSS, JavaScript, icons and illustrations are embedded. It requires no package installation, server, CDN, font download, API key or companion asset folder.

The top controls switch between **Colour Pop** and **After Hours**. **Demo menu** opens the landing page, Studio, filming-plan example, creator setup and embedded asset library. The same menu selects the **All tasks available** or **Restricted (Free)** sample access state.

A useful walkthrough is:

**Studio → An idea → edit the brief → Generate script → Prototype: skip to the result → Filming plan → select a scene → Checks → Export as Markdown.**

The generation step deliberately requires opening the fixed example result. It does not pretend that the prototype called an AI model or generated a response to the entered brief.

**Search**, also opened by **Command/Ctrl + K**, searches the included screens and example drafts. It is not a production-wide search service.

## 3. Screen-by-screen redesign

### Studio

The full-access state preserves three primary entry routes: **An idea**, **My own material**, and **A reference**. Each is now a colour-coded card with a glossy icon, a short description, an explicit sample cost and one clear next action.

Hooks, Ideation and Caption sit in a smaller quick-tool row. They do not force users through full-script steps. The Free sample instead foregrounds those three tools and a separate full-access explanation.

The cards do **not** label existing full-script capabilities “coming soon.” That phrase appeared in the image concepts but conflicts with the supplied prototype’s all-tasks state. The restricted version says the capabilities require another access state; changing the sample state is not an actual subscription action.

A compact **Pick up an idea** section opens authored example drafts. This is a local history concept, not an implemented persistent draft library. Its content-matched thumbnails depict a process, form and checklist rather than unrelated lifestyle photographs.

A short reassurance panel replaces another large block of onboarding or product explanation. More detail is available deliberately. A small filming-plan shortcut makes the signature workspace easy to find.

### Focused briefs

Selecting a task replaces the starting screen with the relevant brief. The existing platform choices, approved-Brain context, optional framework selection and filming constraint remain.

The written-material versus footage-description distinction is retained. Footage input is still a **text description**, not a video upload or media-analysis feature.

The main brief is editable. Its text survives platform changes and theme switching. A visible note explains that the eventual result remains a fixed example, not an AI response to those edits.

### Script workspace

The same result is presented through **Script / Filming plan / Caption / Checks** tabs. Selected tabs now have a clear tinted surface and accent underline. The script remains a readable document rather than being broken into ornamental tiles.

The unresolved-check summary stays outside the tabs. Opening a tab, visiting a finding, copying or exporting does not resolve an issue. The sample amount and name remain explicitly unverified.

Revision opens a real instruction dialog with the sample price. The next screen previews the request and explains that no revised output was generated. The current script remains unchanged.

### Filming plan

The five scene thumbnails are selectable controls, not a video timeline. Only the selected scene’s **Say / Show / Text** instructions are displayed in the default view. The matching vertical planning preview changes with the selected scene.

Previous and Next controls move through the sequence. Previous is disabled at the first scene and Next at the last. Both themes distinguish selection using a border and labelled state, not colour alone.

The preview remains explicitly labelled as a planning sketch, not footage or a rendered video. The example invoice retains its checking marker. A local Markdown export includes the script, filming plan and unresolved checks.

The existing first scene’s “Talking head” tag and process-diagram visual direction are carried over from the source fixture. Their relationship needs review when binding real shot-map data; the illustration is not proof that the source instruction is internally consistent or filmable.

### References

The source list and **Source → Breakdown → Adapt** structure remain. Reference cards have labelled concept covers, not purported extracted frames. Structural parts are selectable; the chosen part reveals its explanation.

The intake expects a public URL and a pasted transcript. It does not fetch or transcribe the video. Continuing displays the authored example breakdown and says so. Structure analysis remains distinct from claims about camera cuts, visual pacing or why a video performed.

Discovery is not presented as a connected feed. Selecting another sample plan does not imply that a working discovery integration appears.

### Creator Brain

The overview uses separate coloured surfaces for voice, audience, goals and content standards, with examples available through disclosure controls. The existing sections remain: **Overview / Your voice / Content strategy / Content standards / Activity**.

The active-versus-proposed distinction is preserved. Editing opens a replacement-draft dialog. Review shows the active fixture beside the proposed text. Confirmation records only a local example draft; it does not activate a real version or silently change the context used in generated content.

Sample Brain exports are labelled as illustrative projections, not complete production creator-data exports. Underlying document names such as Voice, Strategy and Kill Test remain in those sample exports.

### Guided setup

The earlier single audience-and-goals example is now presented inside a navigable **four-step local demonstration**: Your writing → Audience and goals → Preferences → Review and activate.

It demonstrates three own-writing samples, selected goals, voice preferences, Back/Continue, retained answers and an explicit confirmation before completing the example. The source questions and own-writing/reference distinction inform these screens.

**This is not the complete production onboarding contract.** The supplied system snapshot describes a larger structured interview and activation requirements. The prototype must not be used to delete omitted required fields, bypass actual confirmation or claim that voice inference has run. Completing the tour opens the existing authored Brain overview; it does not infer or activate a real Brain.

### Landing and supporting controls

The landing page uses the same theme tokens, new wordmark treatment and embedded illustrations while retaining the previously supplied content-first hero and section order. No testimonials, customer counts or performance figures were added.

Framework, account, billing and access controls open inspectable dialogs instead of silently doing nothing. They explain the sample state and integration boundary. Results retains its self-reported fixture and unavailable comparison state; pressing Save does not claim a persisted result.

## 4. Theme system

Theme is controlled by `data-theme="light"` or `data-theme="dark"` on the root `<html>` element. Both use the same templates, content and state logic.

| Token / treatment | Colour Pop | After Hours |
|---|---|---|
| `--color-bg` | `#FAFBFF` | `#090F22` |
| `--color-surface` | `#FFFFFF` | `#121B33` |
| `--surface-raised` | `#F3F2FB` | `#1A2442` |
| `--color-text` | `#15152E` | `#F6F4FF` |
| `--color-accent` | `#6337E8` | `#B99AFF` |
| `--color-divider` | `#E0E3F0` | `#2E3A5B` |
| Primary actions | Violet gradient, light shadow | Blue-to-violet gradient, controlled glow |
| Category panels | Lavender, peach, mint and blue pastels | Corresponding dark tinted surfaces |
| Unresolved checks | Warm amber-tinted surface | Dark warm surface with bright amber text |
| Selected result tab | Tinted panel plus underline | Tinted panel plus underline |

The theme preference uses the browser-local key `respin.prototype.theme.v5`. Storage failures are caught; switching still works for the current session. This prototype does not include a third “follow system” setting or account-synchronised theme preference.

### Visual rules for implementation

Keep the strongest decorative treatment on entry cards, the brand area and small supporting illustrations. Script text, controls, evidence and financial information need quieter surfaces. Do not extend glow, gradients or handwritten text to every paragraph and field.

Handwritten annotations are decorative and supplementary. No critical instruction or cost depends on them. Standard interface text uses a system-font stack; no font files are included. The annotation font has local fallbacks, so its exact appearance varies by operating system.

The asset collection contains **18 SVG illustrations and 53 outline icon names**. Existing concept illustrations have theme-specific colour variants. The new mascot is a lightweight vector asset, not a generated avatar or customer identity.

The icon masks retain the prototype’s `.ph-*` naming convention, but no external icon-font stylesheet is loaded. The asset-library view can save individual embedded illustrations as SVG.

## 5. Local behaviour and integration boundary

| Behaviour | What works in this file | Production responsibility |
|---|---|---|
| Theme switching | Immediate switch without clearing current work; guarded browser-local preference. | Apply the same semantic tokens to real components; decide whether to sync preferences. |
| Navigation and result tabs | Local state transitions; keyboard result-tab navigation. | Bind real routes, result IDs and access rules. |
| Brief editing | Retained within the open prototype’s navigation; theme/platform switches preserve input. | Authenticated draft persistence and recovery, where approved. |
| Generation | Explicit preparation state followed by fixed sample output. | Actual admission, provider work, checks, durable settlement and retrieval. |
| Scene selection | Selected thumbnail, instructions and preview remain connected. | Bind all three to the same stored beat/shot record. |
| Export | Local fixture download with checking markers and limitations. | Export authorised stored generations and their actual findings. |
| Revision | Instruction entry and request preview; no revised output fabricated. | Parent-linked paid operation, lineage, checks and settlement. |
| Brain editing | Local proposed replacement and confirmation demonstration. | Real document versions, evidence, confirmation and activation. |
| Setup | Four-step illustrative tour with Back/Continue and explicit review. | Complete interview, inference, validation and activation contract. |
| Search and recent drafts | Included examples only. | Scoped persistent search/history, if that enhancement is adopted. |
| Billing, account and Results | Explanatory dialogs or labelled form previews. | Actual ledger, subscriptions, permissions, records and lifecycle controls. |

Only the appearance preference is intentionally persisted to local storage. Briefs, setup responses and proposals are not sent to a server and are not intended to survive closing or reloading the file. Do not enter confidential creator material into a design-review fixture expecting production retention or recovery.

The prototype never establishes a second balance counter, included-revision allowance or new billing unit. Theme and view changes do not perform model operations.

## 6. Sample values and inherited qualifications

The sample prices remain those in the supplied Version 4 prototype: **12 credits** for Idea to Script and written material, **10** for footage description, **4** for reference analysis, **8** for Spin, **2** for Hooks, **3** for Ideation, **1** for Caption and **2** for a requested revision. The **250-credit balance** is also an illustrative fixture.

Those full-script prices differ from the seeded defaults in the 9 September system snapshot. This visual revision does not reconcile or approve new prices. The real product must obtain prices, allowance, availability and balance from its configuration and credit authority.

The earlier qualifications remain: source matching is not proof of truth; quality checks are bounded; a transcript does not establish visual analysis; manual results do not become eligible numerical-learning evidence by accumulating more rows; a suggested Brain update is not an active rule; and prototype draft-history cards are not proof of a deployed history browser.

The historical snapshot’s charging semantics have not been changed by this prototype. A more friendly theme or explanatory dialog must not be interpreted as adopting a no-draft refund policy.

## 7. File structure and developer entry points

The HTML contains:

| Section | Purpose |
|---|---|
| Inline stylesheet | Retained component-layout rules, then the Version 5 semantic tokens, dual-theme treatments and responsive overrides. |
| `#respin-documents` JSON | Studio and landing templates, local component logic, asset inventory and icon names. No former-UI document. |
| `#respin-assets` JSON | Embedded data-URI SVGs, including light/dark variants. |
| Local template adapter | Renders the supplied DC-style template vocabulary without requiring `support.js` or a remote runtime. |
| Final interaction script | Theme switching, search, dialogs, local sample exports and supporting controls. |

Useful review hooks are `window.__respinPreview`, `window.__respinTheme` and `window.__respinModal`. They are prototype conveniences, not proposed public product APIs.

The adapter evaluates the bundled component logic, as the earlier preview did. It must **not** be copied into production as a general execution mechanism for user-provided code. User-entered brief text is data, not executable code.

For product implementation, move the approved theme tokens and component styling into the existing application, then bind the interactions to its current domain and billing boundaries. Do not introduce this preview adapter as a second application runtime.

## 8. Responsive and accessibility behaviour

Desktop uses a persistent sidebar and one principal working area. Below 800 pixels the sidebar yields to compact mobile navigation. Small screens recompose the entry cards; they do not shrink a desktop screenshot.

The filming strip scrolls horizontally inside its own container. The page itself does not need horizontal scrolling in the tested states. On phones, selected-scene instructions precede the planning preview. The script remains naturally scrollable, but unrelated task forms are not stacked above its result.

Result tabs support Left/Right and Home/End keyboard movement. Controls have visible focus styling. Native dialogs handle modal focus, and Escape closes them. Fields are associated with labels by the local renderer. Selected tabs, scenes, access states and unresolved checks have textual or structural cues as well as colour.

Reduced-motion preferences disable decorative transitions. Glow and shadow do not carry essential meaning. The production target should still include comfortably sized touch controls, contrast verification, screen-reader testing and resilient layouts for long real content. This prototype is not a complete accessibility certification.

## 9. Verification performed for this revision

**29 functional checks passed**, covering rendering, comparison removal, both themes, input retention, generation-state navigation, result tabs, selected scenes, previous/next behaviour, persistent checks, check links, Markdown export, revision dialogs, Escape, search, Free-state presentation and the guided setup’s retained answers and confirmation.

**104 layout-state checks were exercised:** 13 states × two themes × viewport widths of **390, 768, 1024 and 1440 pixels**. No page-level horizontal overflow was observed in that matrix. The exercised states were Studio, Free Studio, brief, script, filming plan, checks, references, reference breakdown, reference intake, Brain, setup, Results and landing.

The test run reported **no uncaught page-script errors and no network requests**. Selected desktop and mobile screens were also inspected visually. Internal test captures are not replacement deliverables; the requested output remains the functioning HTML and this handoff.

**Test-method limitation:** the container’s managed Chromium blocked direct `file://` and localhost navigation. Browser checks therefore loaded the self-contained HTML into an in-memory Chromium page. Direct-from-disk launch, browser-storage persistence across reopened files, native browser Back/Forward across a reopened file, clipboard behaviour on each platform, and Safari/Firefox compatibility have not been independently verified here. Storage and clipboard failure paths are guarded, but that is not cross-browser acceptance evidence.

No product repository test suite, deployment, live billing, actual generation, screen-reader audit or real-creator usability study was performed. Prototype tests do not establish production readiness or customer usefulness.

## 10. Implementation handoff

Implement the theme tokens and shared shell first, then the entry cards and selected-scene workspace. Preserve one state model for both themes. Bind checks, prices, creator identity and output provenance before polishing secondary animations or art.

Next carry the theme treatment through the source/reference and Brain views. Review real long-form content, empty/error/recovery states, subscription restrictions and the complete onboarding contract before release. The four-step demonstration is a design illustration, not permission to remove existing required questions.

The key acceptance walkthrough remains: a creator identifies a starting point, prepares a brief, understands the cost, reads a draft, finds what needs checking, knows what to film, and exports the intended result without losing context. The design should make that journey clearer in either theme—not substitute decoration for it.
