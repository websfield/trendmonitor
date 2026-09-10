**We should build an agency billing-control workspace that makes sure approved work reaches the invoice—and helps the team resolve unapproved changes before they become unpaid work.**

Not a chatbot. Not a dashboard claiming “you have A$40,000 of revenue leakage.” And not another accounting or project-management system.

The product should answer four practical questions:

> **What did we agree to do? What changed? What can we bill now? Has it actually been billed correctly?**

Its main screen would be the agency’s **next billing run**, with evidence-backed items that finance can act on.

Below is the product I would ask you to build.

# 1. Start with one type of agency workflow

I would initially support **fixed-fee projects, milestone billing and separately approved variations**, for agencies using **Xero and Microsoft 365**.

That is a deliberate product boundary, not a claim that every agency uses that combination.

The initial users would be the account manager who knows what happened and the finance manager responsible for invoicing. The owner gets visibility, but we should not design primarily for an owner looking at charts.

I would exclude complicated retainers, time-and-materials billing, media-spend reconciliation and multi-currency consolidation initially. Supporting every commercial model would make the first product unnecessarily difficult to trust.

The core workflow would be:

**Confirmed agreement → change or billing event → evidence and review → invoice preparation → reconciliation.**

# 2. Build six connected capabilities

## A. A confirmed record of what the client bought

**Pain to solve:** Before assessing an extra request or preparing an invoice, someone has to reconstruct the agreement from proposals, amendments and messages.

### What we build

A **Project Commercial Record** created from the signed agreement, approved amendments and relevant supporting records.

It would contain:

| Information                   | Example                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| Deliverables and quantities   | Twelve short videos and one campaign report.                              |
| Included revisions            | Two revision rounds, with the agreed definition attached.                 |
| Fixed fees and approved rates | A$24,000 project fee; additional cutdowns at A$600 each where agreed.     |
| Billing triggers              | Deposit on acceptance; balance on an agreed milestone.                    |
| Exclusions and dependencies   | Additional filming excluded; client supplies specified assets.            |
| Approval requirements         | Named client approver; purchase order required before invoice submission. |
| Current agreement version     | Original scope plus approved variation 02.                                |

AI would extract a proposed record. **A responsible agency user must confirm the important commercial fields before we use them to recommend billing.**

Every field needs a link to the supporting passage. Missing information stays missing; the model must not invent a rate or infer an approval limit.

Amendments must create versions. We cannot overwrite the original agreement and lose the ability to explain an earlier invoice.

**The outcome:** Finance and account management work from the same confirmed commercial record instead of repeatedly interpreting the paperwork.

---

## B. A project changes inbox

**Pain to solve:** New requests and approvals occur during delivery but never become structured commercial records.

### What we build

A **Changes Inbox** that collects relevant project communications and suggests what changed.

For the first internal version, allow selected email uploads, forwarding and manual capture. For the repeat-use product, add an authorized Microsoft 365 connection covering the relevant project mailboxes.

It needs both sides of the conversation: the client’s request and the agency’s response containing scope, price or conditions.

Each potential change should show:

**What was requested, what the current agreement covers, whether a price was proposed, what approval exists, and who needs to decide.**

The classifications should be practical:

| Classification                   | What happens next                                           |
| -------------------------------- | ----------------------------------------------------------- |
| Already included                 | Link to the agreement and close the case.                   |
| Replaces an existing deliverable | Review the substitution; do not automatically add a fee.    |
| Extra work, price not approved   | Send to the account manager for a commercial decision.      |
| Extra work, price approved       | Record the variation and its billing conditions.            |
| Intentionally complimentary      | Record the concession and approver.                         |
| Unclear                          | Ask for the missing evidence; do not manufacture certainty. |

Multiple emails about the same change must become **one case**, not repeated alerts.

**Important distinction: approving a creative asset is not necessarily approving an additional charge.** “Looks good” cannot automatically become agreement to pay A$3,600.

**The outcome:** Requests stop disappearing between client conversations and finance, without treating every client request as a billable opportunity.

---

## C. A way to resolve scope changes—not just flag them

**Pain to solve:** Knowing that something is out of scope does not tell the account manager what to do next.

### What we build

For each unresolved change, the account manager can choose to:

**Quote it, substitute existing work, include it, decline it, or seek clarification.**

When quoting, the system prepares a concise variation summary containing the additional deliverables, agreed or proposed price, schedule impact and relevant conditions.

The account manager edits and approves the message. We record the resulting client decision and its evidence.

**We do not need to build an electronic-signature platform.** In the initial release, attach the accepted amendment or approval captured through the customer’s existing process. Where an existing proposal system owns the change order, store its reference rather than duplicate it.

Ignition already supports amending an accepted proposal and sending a change order for client acceptance. Rebuilding that capability in isolation would not give us a compelling product. ([Ignition Help Center][1])

Our contribution is connecting that decision to the original request, the delivery and the eventual invoice.

Keep three things separate:

**Client approval of the commercial change, internal approval to proceed, and finance approval to prepare billing.**

An employee clicking “approved” must not silently stand in for client approval.

**The outcome:** Each change reaches a recorded commercial decision instead of remaining an unresolved warning.

---

## D. Line-item reconciliation against actual invoices

**Pain to solve:** Even when a change is approved, the invoice can omit it, include only part of it, use the wrong rate or duplicate something already billed.

**This is the most important capability.**

### What we build

A reconciliation engine comparing the confirmed commercial record and satisfied billing conditions against Xero invoice lines.

The first version should detect a narrow set of exceptions:

| Exception                              | Example                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Approved variation absent from billing | Six approved additional cutdowns never appear on an invoice.                   |
| Partially billed variation             | Six were approved, but only four were billed.                                  |
| Billing milestone omitted              | The agreed billing trigger occurred, but the corresponding invoice is missing. |
| Quantity or price mismatch             | An invoice uses an outdated quantity or rate.                                  |
| Potential duplicate or excess billing  | The same approved work appears twice.                                          |

That last category matters. **We should protect invoice accuracy, not simply recommend higher invoices.**

Xero exposes invoice records and credit notes through its Accounting API. These provide the accounting-side data needed for reconciliation; our product would supply the missing relationship to the commercial evidence. ([Xero Developer][2])

### This cannot be a total-versus-total comparison

The system must support an approved variation billed across several invoices and an invoice covering several milestones.

It needs explicit allocations between **commercial items and invoice lines**. Where the relationship is ambiguous, suggest a match and ask finance to confirm it.

It must also distinguish a missing charge from:

* A charge deliberately scheduled for later.
* An existing draft invoice.
* A waived or disputed amount.
* A credit note or a corrected invoice.
* Work whose contractual billing condition has not yet occurred.

A credit must not automatically create a recommendation to bill the customer again.

### What the customer would actually see

**Illustrative case; amounts exclude GST:**

> **Spring campaign — A$1,200 potentially omitted**
>
> **Approved change:** Six additional cutdowns at A$600 = A$3,600.
> **Billing condition:** Confirmed satisfied by the project reviewer.
> **Already invoiced:** Four additional cutdowns = A$2,400.
> **Remaining amount for finance review:** A$1,200.
>
> **Evidence:** Approved variation, delivery confirmation, matched invoice line.
>
> **Actions:** Prepare remaining invoice items · Link another invoice · Defer with reason · Waive or dispute.

It should recommend **A$1,200—not the full A$3,600**.

**The outcome:** Finance gets a precise, explainable discrepancy rather than another document-analysis task.

---

## E. An actionable billing desk

**Pain to solve:** Findings do not become money or saved time unless somebody owns the next action.

### What we build

A **Billing Run** screen organized around the customer’s billing cutoff.

It would have four queues:

| Queue                        | What belongs there                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| **Ready for finance review** | Evidence is assembled and the billing condition appears satisfied.                  |
| **Blocked**                  | Missing approval, purchase order, delivery confirmation or another necessary input. |
| **Scheduled for later**      | Valid item, but not due in this billing run.                                        |
| **Resolved**                 | Matched to billing, waived, rejected, deferred appropriately or otherwise closed.   |

Every open item has an owner, next action and due date. Repeatedly dismissed findings should not reappear unchanged.

Finance can select reviewed items and produce an **invoice preparation pack** containing the line descriptions, quantities, rates, project references and supporting evidence.

Initially, export the approved items in a supported format for the customer’s accounting process. Once the controls are proven, add **human-approved creation of draft Xero invoices**. Xero supports invoice creation through its API. ([Xero Developer][3])

Do not automatically authorize, send or chase those invoices.

A timeout, refresh or repeated click must not create duplicate drafts. After handoff, the system must retrieve the resulting invoice and confirm what actually happened.

If finance changes the draft in Xero, our system should reconcile the change rather than assume the original preparation pack was used unchanged.

**The outcome:** The product helps finish the billing job. It does not stop at identifying a problem.

---

## F. A recurring billing-control and outcome report

**Pain to solve:** The customer needs an ongoing control, not a one-off historical cleanup followed by empty dashboards.

### What we build

Before each billing cutoff, the product updates the review queue and requests any missing decisions.

After the run, it produces a **Billing Control Report** showing which projects were checked, what remains unresolved, which items reached invoices and what changed since the previous run.

The owner’s report should separate:

| Measure                              | Meaning                                                |
| ------------------------------------ | ------------------------------------------------------ |
| Potential exceptions                 | Not yet validated; not revenue.                        |
| Finance-confirmed billable items     | Confirmed for the relevant billing conditions.         |
| Items added to invoices              | Reflected in accounting records.                       |
| Invoice payment status               | What the accounting system reports.                    |
| Waived, disputed or rejected amounts | Deliberate decisions, separately explained.            |
| Review effort                        | Time and recurring work needed to operate the product. |

These are stages, **not amounts to add together**.

A paid invoice also does not necessarily represent fresh cash generated by us. Xero’s schema separately records payments and credited amounts, including applied credits, prepayments and overpayments. The reporting must preserve those distinctions. 

Where a payment covers multiple items, do not pretend to know item-level cash attribution without a defensible allocation.

For value reporting, let finance identify whether an item was genuinely overlooked or already on its normal billing list. That is customer-confirmed attribution—not proof of causality.

**The outcome:** Customers can see the control operating each month and assess its benefit without inflated “revenue recovered” figures.

# 3. The feature most dashboards omit: honest data coverage

I would make **Data Health and Coverage** a first-release feature.

Every project and billing run needs to show what the system actually checked: agreement version, connected accounting entity, communications coverage, latest successful sync and unresolved import errors.

For example:

> **Review incomplete: accounting data last synchronized three days ago. Two project mailboxes are not connected.**

That must not appear as:

> **No billing issues found.**

The system should block an “all checked” sign-off where required coverage is missing.

Manual uploads are adequate for an initial diagnostic. **They are not a basis for claiming continuous monitoring of every project communication.**

For Microsoft 365, access must be scoped and tested. Microsoft supports mailbox-scoped application permissions through Exchange Online Application RBAC, but also warns that unscoped permissions granted elsewhere can defeat that restriction. A folder filter in our interface is not, by itself, a security boundary. ([Microsoft Learn][4])

# 4. How I would structure the software

The central object should be a **commercial case**, not a chat conversation.

A case links the project, agreement version, request or billing event, supporting evidence, decisions, expected billing item and actual invoice allocations.

The important division of responsibility is:

| Responsibility                                             | Implementation                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| Read documents and suggest relationships                   | AI-assisted extraction and matching, with source references. |
| Calculate amounts, validate states and prevent duplicates  | Deterministic application code.                              |
| Confirm commercial interpretation, concessions and billing | Authorized customer users.                                   |
| Record invoices, credits and payment status                | Xero remains the accounting authority.                       |

Use a relational database for these relationships and decisions, secure document storage for evidence, and background workers for extraction and synchronization. We do not need a multi-agent architecture to deliver this workflow.

The difficult engineering is **correct state, provenance and reconciliation**, not getting a model to summarize an agreement.

Emails and attachments must also remain untrusted inputs. OWASP describes how instructions embedded in external documents can manipulate model behavior. The document-reading component should not have authority to change permissions, issue invoices or execute arbitrary actions. ([OWASP Gen AI Security Project][5])

Tenant isolation, role-based access, audit history, deletion/export, backup recovery and controlled model-provider data handling are part of the product—not a later enterprise upgrade.

# 5. What we should deliberately not build

I would exclude a replacement CRM, project-management platform, timesheet system, accounting ledger, collections agent and custom electronic-signature service.

I would also exclude generalized agency profitability prediction and automated legal conclusions about whether disputed money is owed.

And I would not make “ask your financial documents anything” the main interface. Search may help, but it is not the core job.

The competitive boundary matters. Accelo already provides project invoicing, while Scopekeeper already advertises email-based scope-creep detection. **Our proposed advantage must be the connected, evidence-backed resolution of omissions across these records—not merely another scope detector or invoice screen.** ([Accelo][6])

That advantage still needs to survive comparison with properly configured alternatives.

# 6. The build order I would give you

These are implementation increments toward one complete product—not three separate applications.

| Increment                            | Build                                                                                                                                       | Demonstrate before expanding                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **1. Reconcile one real project**    | Evidence upload, confirmed commercial record, accounting import, invoice-line matching and a reviewable exception.                          | Correctly distinguish a genuine omission from partial billing, scheduled billing and a concession. |
| **2. Complete the billing workflow** | Ownership, approval decisions, billing queue, invoice preparation/export and reconciliation of the resulting invoice.                       | Finance can resolve a case without us manually reconstructing everything behind the scenes.        |
| **3. Make it recurring**             | Xero synchronization, authorized Microsoft 365 ingestion, grouped change detection, reminders, coverage monitoring and billing-run reports. | The next billing cycle works with materially less manual collection and review.                    |

Native draft-invoice creation comes after the export-and-reconciliation path is reliable. Additional accounting platforms and project-management integrations come after we have evidence that they unlock worthwhile customers.

## The acceptance cases I would insist on

Before calling the product ready for a paid operational pilot, it must handle these cases correctly:

| Test case                                          | Required result                                              |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Approved A$3,600 variation, A$2,400 already billed | A$1,200 remaining—not A$3,600.                               |
| Extra work requested, but no price approved        | Commercial decision required; no automatic billable amount.  |
| A valid milestone is scheduled for next month      | Scheduled—not reported as a current omission.                |
| The same approval is forwarded three times         | One case, not three opportunities.                           |
| A charge was credited or waived                    | Reason reviewed; no automatic rebilling.                     |
| A draft-creation request is retried after failure  | No duplicate invoice.                                        |
| Accounting connection fails                        | Coverage warning; no false “all clear.”                      |
| Another agency’s user requests the evidence        | Access denied, including through search and model retrieval. |

I would test known omissions **and clean projects**. A system that finds issues everywhere is not a revenue-assurance product; it is extra work for finance.

# My actual build recommendation

**Build the billing desk and reconciliation engine first, supported by a confirmed agreement record and evidence-backed cases. Then automate how changes enter that workflow.**

The initial product should be able to take this situation:

> “The client approved it, the team did it, but nobody knows whether it reached the invoice.”

And turn it into:

> “Here is the approved item, here is what has already been billed, here is the exact remaining action, and here is the record showing it was resolved.”

**That is the product—not the AI alert, and not the A$1,500 price tag.**

[1]: https://support.ignitionapp.com/en/articles/15198048-create-and-send-change-orders "Create and send change orders | Ignition Help Center"
[2]: https://developer.xero.com/documentation/api/accounting/invoices?utm_source=chatgpt.com "Accounting API Invoices — Xero Developer"
[3]: https://developer.xero.com/documentation/best-practices/data-integrity/creating-invoices?utm_source=chatgpt.com "Creating Invoices"
[4]: https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac "Role Based Access Control for Applications in Exchange Online | Microsoft Learn"
[5]: https://genai.owasp.org/llmrisk/llm01-prompt-injection/ "LLM01:2025 Prompt Injection - OWASP Gen AI Security Project"
[6]: https://help.accelo.com/guides/user/modules/billing-and-invoices/invoices/projects/ "Project Invoicing Guide | Invoices | Accelo"
