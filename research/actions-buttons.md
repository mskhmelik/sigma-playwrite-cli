# Actions and buttons — AI app: reference data management

Read-only notes. Workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`, from `research/00-inventory.md`. Nothing here was expanded, published, or edited.

Two statuses are used below.

- **Confirmed in this workbook.** Seen on a page in the inventory. Sequence names only. The steps inside them were not opened.
- **Documented only.** Described in Sigma help or a QuickStart. Not seen as a configured effect in this workbook.

## Buttons that exist

App (`92MJn5HcRL`): **New**, **AI**, **Log**, **L1-L2**.

Modal pages also title these controls: **Apply**, **Cancel**, **Close**, **Generate**, **I'm lazy**, **Bulk approve**, **Bulk deny**.

Warning and error acknowledgements, by page:

| Page | Id | Acknowledgement labels |
|---|---|---|
| m.err.wrong_id_format | `Wf6lkxTPZI` | I will follow the convention |
| m.err.missing_values | `sVr-9ilvBP` | I will populate all fields |
| m.err.no_access | `IMl8K9bE0H` | I'm going to grind for promotion |
| m.w.dup_item | `puoIT26p-G` | Take me back, Let me compare, I want to change it |
| m.err.dup_hierarchy | `LmHu63KOF-` | I will change L1 or L2 or both |
| m.w.remove_item | `9sHGZpL_mT` | Keep the record, Remove the record |
| m.w.remove_record | `OFF1Z_KsP_` | Keep the record, Remove record |

Other titled controls on modal pages, from the same inventory: m.agent **Reset chat**; m.manage_hierarchy **Add to the hierarchy** and **Show me log**; m.approvals **Decision**. p.filters titles filters (Name, L1 category, L2 subcategory, Unit price), not buttons.

No action sequence was opened on any of these buttons. A title is not evidence of an effect.

## Sequences confirmed on m.new

On `m.new` (`4ycELmnjx0`), the Actions panel lists three sequences:

- **On click - primary**
- **On click - secondary**
- **On close**

**Confirmed in this workbook:** those three names, on that modal page.

**Documented only:** what a step inside them does. The steps were not expanded. Do not treat Apply as primary, Cancel as secondary, or Close as the X. The inventory does not say which footer button is primary or secondary, or whether the close icon is on.

Sigma's modal trigger definitions, which match the names and nothing more:

| Sequence name | Documented trigger |
|---|---|
| On click - primary | User clicks the primary button. |
| On click - secondary | User clicks the secondary button. |
| On close | User clicks the X or clicks outside the modal. |

Source: [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions). A QuickStart shows the same three ideas in the modal Format and Actions menus: Primary and Secondary footer buttons, and an **On close** sequence that can be deleted after **Show close icon** is turned off. Source: [Native Sigma Snapshot Workflow](https://quickstarts.sigmacomputing.com/guide/dataapps_native_sigma_snapshot_workflow/index.html).

## Documented click paths

Every effect below is **documented only** for this workbook. The shared setup on the help pages is the same: open the draft or a view, select the trigger element, open the editor panel **Actions** tab, create a sequence or pick an existing one, then select the default action or click **Add action**. The action modal is where the effect is chosen.

### Open a modal

**Documented only.**

1. In the action modal, set **Action** to **Open modal/drawer**.
2. In **Select modal/drawer**, pick the modal or drawer to open, or choose **New modal**.

**Close modal/drawer** is the paired effect. It does not ask for a target. It must be configured on an element inside the modal or drawer it closes.

Help: [Create actions that control modals, drawers, and tabbed containers](https://help.sigmacomputing.com/docs/create-actions-that-control-modals-drawers-and-tabbed-containers). Effect name in the catalog: [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions).

QuickStarts use the shorter label **Open a modal** / **Close modal**, and they put **Open a modal** last in a sequence that first sets control values. Sources: [Approvals](https://quickstarts.sigmacomputing.com/guide/dataapps_approvals_flow/index.html), [Native Sigma Snapshot Workflow](https://quickstarts.sigmacomputing.com/guide/dataapps_native_sigma_snapshot_workflow/index.html), [Crowdsource Ideas with a Sigma AI App](https://quickstarts.sigmacomputing.com/guide/dataapps_crowd_sourcing/index.html). Those guides do not say that New, AI, Log, or L1-L2 in this workbook open any `m.*` page.

### Navigate to a page

**Documented only.** This is page focus inside the current workbook, not opening a modal.

1. In the action modal, set **Action** to **Navigate in this workbook**.
2. In **Destination**, select the page or element to focus. The effect shifts focus to the top of that page, or to that element.

Help: [Create actions that navigate to destinations](https://help.sigmacomputing.com/docs/create-actions-that-navigate-to-destinations). Effect line: [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions).

A QuickStart adds a **Button** from **Element bar > UI** and describes an action that sends the user to another page. The extracted page text does not name the Action dropdown. Source: [Fundamentals 07: Design Elements](https://quickstarts.sigmacomputing.com/guide/fundamentals_7_design_v3/index.html). The help page is the one that names the action.

**Open Sigma doc** is a different action. It opens another workbook. It is not a page switch inside this workbook.

### Set a control value

**Documented only.**

1. In the action modal, set **Action** to **Set control value**.
2. **Update control**: the target control in the current workbook.
3. **Set value as**: **Static values**, **Column** (only when the trigger is a table, pivot table, input table, or visualization), **Control**, or **Formula**.
4. **Set control selection to**: **Replace previous selection**, **Add to existing selection**, or **Remove from existing selection**.

Help: [Create actions that manage control values](https://help.sigmacomputing.com/docs/create-actions-that-manage-control-values).

The Approvals QuickStart adds **Set control value** on a table action sequence so a clicked row's column is passed into a named control on a modal, and it warns that a column of the wrong data type stays greyed out. Source: [Approvals](https://quickstarts.sigmacomputing.com/guide/dataapps_approvals_flow/index.html). The snapshot guide does the same, then leaves **Open a modal** as the last step. Source: [Native Sigma Snapshot Workflow](https://quickstarts.sigmacomputing.com/guide/dataapps_native_sigma_snapshot_workflow/index.html).

### Clear one control

**Documented only.**

1. In the action modal, set **Action** to **Clear control**.
2. Set **Apply to** to **Specific control**.
3. Pick that control in the target dropdown.
4. Optional checkbox: **Reset to published value**. On a tagged version, that resets to the tagged version's values.

The same action's **Apply to** list also includes **Container**, **Tabbed container**, and **Entire workbook**. **Tab** appears only when **Apply to** is **Tabbed container**.

Help: [Create actions that manage control values](https://help.sigmacomputing.com/docs/create-actions-that-manage-control-values).

QuickStarts sometimes say **Clear control value** and clear by container name, or they clear a control by setting **Set control value** to a blank value. Those are tutorial wordings. The help-center action name is **Clear control**, and a blank set is not the same configuration. Sources: [Native Sigma Snapshot Workflow](https://quickstarts.sigmacomputing.com/guide/dataapps_native_sigma_snapshot_workflow/index.html), [API Actions - Getting Started](https://quickstarts.sigmacomputing.com/guide/developers_api_actions_getting_started/index.html), [Crowdsource Ideas with a Sigma AI App](https://quickstarts.sigmacomputing.com/guide/dataapps_crowd_sourcing/index.html).

### Clear all controls on a page

**Documented only.** This is the same **Clear control** action, with a wider scope.

1. Set **Action** to **Clear control**.
2. Set **Apply to** to **Page / modal**.
3. Pick the page or modal in the **Page / modal** dropdown.
4. Optional: **Reset to published value**.

Help: [Create actions that manage control values](https://help.sigmacomputing.com/docs/create-actions-that-manage-control-values).

The crowdsource QuickStart describes the outcome in plain language: an action that clears all controls on the modal page `m.Add new idea`, then a second action that closes the modal. The Cancel button gets the same clear-then-close pair. The extracted text does not print the **Apply to** field; the help page does. Source: [Crowdsource Ideas with a Sigma AI App](https://quickstarts.sigmacomputing.com/guide/dataapps_crowd_sourcing/index.html).

Clearing a container is a different scope (**Apply to** = **Container**). Fundamentals notes that naming a container lets one action clear every control inside it. Source: [Fundamentals 07: Design Elements](https://quickstarts.sigmacomputing.com/guide/fundamentals_7_design_v3/index.html). That is not the same as clearing a whole page.

## What this workbook does not confirm

- Which effect sits inside **On click - primary**, **On click - secondary**, or **On close** on `m.new`.
- Whether New, AI, Log, L1-L2, Apply, Cancel, Close, Generate, I'm lazy, Bulk approve, Bulk deny, or any acknowledgement runs open-modal, navigate, set-control, or clear-control.
- Control ids for the filters or the create-item fields. Titles are known. Control ids were not recorded.
- Any insert-row, update-row, delete-row, or call-agent step. Those effects exist in the docs and were not part of this pass.

## Proposed commands

Not implemented. Today's CLI commands are `api`, `arrange`, `place`, `select`, `size`, `set`, and `add`. `set` already means element format keys (`content`, `fill`, `padding`, `color`). These proposals use `action` so a control value is not confused with that.

Placeholders are shapes. They are not claims about this workbook. `--page` is the page that holds the trigger, matching the flag already used by `select` and `set`. A modal footer sequence has no element title; pass `--sequence` with the confirmed name. A button on App has a title; pass `--title`.

Page switch, as the documented **Navigate in this workbook** action:

```text
sigma-playwrite-cli action --url <workbook-url> --page <page-name> --title <button-title> --effect navigate --destination <page-name>
```

Set one control (**Set control value**, static value, replace the previous selection):

```text
sigma-playwrite-cli action --url <workbook-url> --page <page-name> --title <button-title> --effect set-control --control <control-title> --value-as static --value <text> --selection replace
```

Clear one control (**Clear control**, **Apply to** = **Specific control**):

```text
sigma-playwrite-cli action --url <workbook-url> --page <page-name> --title <button-title> --effect clear-control --apply-to control --control <control-title>
```

Clear every control on a page or modal (**Clear control**, **Apply to** = **Page / modal**). Example shape uses the confirmed `m.new` sequence name as the trigger location, not as a known effect:

```text
sigma-playwrite-cli action --url <workbook-url> --page m.new --sequence "On click - primary" --effect clear-control --apply-to page --target m.new
```

Optional flag on either clear form, matching the help checkbox: `--reset-published`.

Related, same command, for the documented open-modal path. Still not a workbook fact:

```text
sigma-playwrite-cli action --url <workbook-url> --page <page-name> --title <button-title> --effect open-modal --modal <modal-page-name>
```
