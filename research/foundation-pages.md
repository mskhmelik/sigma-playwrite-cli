# Foundation pages — AI app: reference data management

Source: `research/00-inventory.md`. Workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`. The inventory was taken in Edit mode. It does not record which page tabs are currently hidden.

Sigma’s own layout is the same shape this workbook uses. A workbook holds pages. Each page holds elements. You add a page from the workbook footer with **Add page** while editing ([Design workbook layouts](https://help.sigmacomputing.com/docs/design-workbook-layouts)). A modal is a separate hidden page tab that opens as an overlay ([Use modals to create focused content views](https://help.sigmacomputing.com/docs/use-modals-to-create-focused-content-views)). A page you do not want viewers to open is hidden from the page-tab menu ([Manage workbook page visibility](https://help.sigmacomputing.com/docs/manage-workbook-page-visibility)).

## The pattern

| Page | Id | Role |
|---|---|---|
| App | `92MJn5HcRL` | Front end. The page the user sees. |
| Logic | `lDcvntEFrg` | Data and calculation page. Backend blocks, variables, and change logs. |
| Problem statement | `HfBs9BvWoh` | Narrative. No element titles. |
| p.filters | `V1IhEqOkBl` | Filter page. Name, L1 category, L2 subcategory, Unit price. |
| m.agent | `RsNb_P5hRa` | Modal. Agent chat. |
| m.new | `4ycELmnjx0` | Modal. Create item. |
| m.edit | `AbHNggM9KX` | Modal. Edit item. |
| m.manage_hierarchy | `sk6FYQbLNZ` | Modal. Hierarchy. |
| m.change_log_item | `6xou4psNjd` | Modal. Item change log and bulk approve/deny. |
| m.change_log_hierarchy | `BNv0LuFItr` | Modal. Hierarchy change log. |
| m.approvals | `P5znZ41DvC` | Modal. One change request. |
| m.err.wrong_id_format | `Wf6lkxTPZI` | Error modal. |
| m.err.missing_values | `sVr-9ilvBP` | Error modal. |
| m.err.no_access | `IMl8K9bE0H` | Error modal. |
| m.w.dup_item | `puoIT26p-G` | Warning modal. |
| m.err.dup_hierarchy | `LmHu63KOF-` | Error modal. |
| m.w.remove_item | `9sHGZpL_mT` | Warning modal. |
| m.w.remove_record | `OFF1Z_KsP_` | Warning modal. |

**App** is the front end. Titled controls on it are New, AI, Log, and L1-L2. The page also carries greeting text, the company name and one-liner, a segmented access control (`manager` / `user`), description search, and the table “Master log of all items.”

**Logic** is the data and calculation page. It is not a second screen for the user. Section bars run from system settings and the raw item table (`BE - Raw - DIM_ITEMS`) through ID generation, the AI function call, input tables, variables (`v.*`), system values (`sys.*`), change logs, and the output that unions approved changes with original data. Backend blocks use the `BE -` prefix. Hierarchy is called out as outside approvals. Nothing on this page is titled only `RAW`.

**Problem statement** is narrative. It has no element titles. It explains the workbook. It is not a control surface.

**p.filters** is the filter page. The `p.` prefix marks a page of front-end filters, separate from both the App canvas and the Logic page.

**m.\*** pages are separate modals, one page tab each. The prefix splits three jobs:

- `m.` — the interaction (create, edit, hierarchy, change logs, approvals, agent chat).
- `m.err.` — error modals (wrong id format, missing values, no access, duplicate hierarchy).
- `m.w.` — warning modals (duplicate item, remove item, remove record).

Error and warning copy lives on its own modal page. It is not an inline message on App or Logic. On `m.new`, the Actions panel lists sequences named **On click - primary**, **On click - secondary**, and **On close**. Those steps were not expanded. Leave them alone.

Sigma describes a modal the same way: a new hidden page tab, edited like a page, opened by an **Open modal/drawer** action, with a header and a footer of primary and secondary buttons ([Use modals](https://help.sigmacomputing.com/docs/use-modals-to-create-focused-content-views), [Create actions that control modals, drawers, and tabbed containers](https://help.sigmacomputing.com/docs/create-actions-that-control-modals-drawers-and-tabbed-containers)). The footer sequences **On click - primary** and **On click - secondary** are the ones Sigma wires on a modal’s own buttons ([Lesson six: Organization](https://help.sigmacomputing.com/docs/lesson-six-organization)).

## What is styled the same way

The editor theme for the workbook is **Lumi**. Theme, color, and font are workbook settings, opened by clicking the page background and choosing **Workbook settings** ([Design workbook layouts](https://help.sigmacomputing.com/docs/design-workbook-layouts)).

The modal format recorded in the inventory is the format panel on the `m.new` screenshot (`research/screenshots/beauty-controls-01-m-new.png`):

- Width **Small**
- Spacing **Medium**
- Padding **on**
- Element gap **on**

That panel is the shared modal style for this asset. The inventory does not include a format-panel screenshot for the other `m.*` pages, so this file treats the `m.new` panel as the style those modal pages share.

Those four settings are also Sigma’s modal defaults. Width defaults to Small (Extra small, Small, Medium, Large, Extra large). Spacing defaults to Medium (Small, Medium, Large). Padding is on by default. Element gap is on by default. Both toggles live under **Format > Modal style** after the modal is selected ([Use modals](https://help.sigmacomputing.com/docs/use-modals-to-create-focused-content-views)).

## What the docs say about pages, modals, and hiding

Searches of `https://help.sigmacomputing.com/docs` and `https://quickstarts.sigmacomputing.com` both returned results. Neither search failed.

**Pages.** Add a page with **Add page** in the footer while editing. Pages group a workbook into separate surfaces ([Design workbook layouts](https://help.sigmacomputing.com/docs/design-workbook-layouts), [Lesson one: Basic organization and navigation](https://help.sigmacomputing.com/docs/lesson-one-basic-organization-and-navigation)).

**Modals.** Add one from **Layout > Modal** on the Add element bar, from the footer arrow then **Add modal**, from **More options > Add modal**, or by choosing **New modal** in an Open modal action. The modal name on the tab is separate from the title in the header. In the published workbook, modal tabs stay hidden until an action opens them ([Use modals](https://help.sigmacomputing.com/docs/use-modals-to-create-focused-content-views), [AI Apps Fundamentals](https://quickstarts.sigmacomputing.com/guide/dataaps_fundamentals/index.html), [Fundamentals 12](https://quickstarts.sigmacomputing.com/guide/Fundamentals_12_repeater_single_row_containers/index.html)).

**Hiding a page.** Page visibility is not a security control. It applies in View and Explore. The owner and anyone with Can edit still see every page in Edit mode. At least one page must stay unrestricted.

Click path ([Manage workbook page visibility](https://help.sigmacomputing.com/docs/manage-workbook-page-visibility)):

1. Open the workbook in Edit mode.
2. Locate the page tab.
3. Click the caret on that tab.
4. Select **Hide page** (or **Unhide page**).

**Customize page visibility** on the same menu can hide the page from everyone, show it to everyone, or show it only to selected users and teams. A hidden tab shows a hidden icon. The Fundamentals quickstart uses the same click on a page renamed `Data`: menu arrow on the tab, then **Hide page**. Viewers lose the tab. Editors still see it. Check with **Preview with** under Publish ([Fundamentals 01: Overview](https://quickstarts.sigmacomputing.com/guide/fundamentals_1_getting_around_v3/index.html)).

That is the split this workbook is built on. **Logic** is the data page you hide. **App** is the page you leave visible. **m.\*** tabs are modals, which Sigma already hides until **Open modal/drawer** runs. The AI Apps quickstart hides every ordinary page except the app page, and notes that modal tabs are hidden on their own in the published version ([AI Apps Fundamentals](https://quickstarts.sigmacomputing.com/guide/dataaps_fundamentals/index.html)).

## Proposed settings for this asset

`sigma-playwrite-cli` today selects, sizes, and formats elements on a named page. `--page` is required when a workbook has more than one page. It does not store page roles. These settings are proposed for this workbook only. They are not commands the CLI runs today.

```
theme = Lumi

page.App.role = front
page.Logic.role = logic
page.Problem statement.role = narrative
page.p.filters.role = filters

page.m.agent.role = modal
page.m.new.role = modal
page.m.edit.role = modal
page.m.manage_hierarchy.role = modal
page.m.change_log_item.role = modal
page.m.change_log_hierarchy.role = modal
page.m.approvals.role = modal

page.m.err.wrong_id_format.role = error
page.m.err.missing_values.role = error
page.m.err.no_access.role = error
page.m.err.dup_hierarchy.role = error

page.m.w.dup_item.role = warning
page.m.w.remove_item.role = warning
page.m.w.remove_record.role = warning

modal.width = Small
modal.spacing = Medium
modal.padding = on
modal.element-gap = on

page.App.visibility = show
page.Logic.visibility = hide
page.Problem statement.visibility = hide
```

`p.filters` stays role `filters`. The inventory does not say whether that tab is hidden. Modal visibility is the product behavior (hidden until opened), so it is not a separate hide setting here.

Proposed commands, once `--role` resolves to the page name:

```
sigma-playwrite-cli select --url <workbook-url> --role front --title New
sigma-playwrite-cli select --url <workbook-url> --role logic --title "BE - Raw - DIM_ITEMS"
sigma-playwrite-cli select --url <workbook-url> --page m.new --title "Create item"
```

Until `--role` exists, pass the page name with the command that already exists:

```
sigma-playwrite-cli select --url <workbook-url> --page App --title New
sigma-playwrite-cli select --url <workbook-url> --page Logic --title "BE - Raw - DIM_ITEMS"
```

Click path for hiding the logic page (and any other ordinary page that should stay off the front end): [Manage workbook page visibility](https://help.sigmacomputing.com/docs/manage-workbook-page-visibility). The same click, shown on a data page, is in [Fundamentals 01: Overview](https://quickstarts.sigmacomputing.com/guide/fundamentals_1_getting_around_v3/index.html).
