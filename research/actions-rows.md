# Row actions — insert, edit, delete

Read-only notes. Workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`. Sources: `research/00-inventory.md`, screenshot `research/screenshots/beauty-containers-01-app.png`, and Sigma help plus quickstarts fetched on 12 Oct 2026.

Two layers stay separate below. **Seen in this workbook** is only what the inventory and screenshot show. **Documented click path** is Sigma’s published UI, and it was not executed in this workbook. The sequences on `m.new` were listed and not expanded, so this file does not assign Insert, Update, or Delete effects to Apply, the pencil, or the trash icon.

The CLI today is `api`, `arrange`, `place`, `select`, `size`, `set`, and `add`. The commands at the end are proposals. They are not implemented.

## Seen in this workbook

### App table

Page `App` (`92MJn5HcRL`). Table title **Master log of all items**. Screenshot shows columns ID, Name, Description, L1 category, L2 category, Unit price USD/each, **Edit** (pencil), **Drop** (trash). Summary line shows 1,157 rows. Buttons on the page include **New**, **AI**, **L1-L2**, and **Log**. This table is the front-end log. Nothing in the inventory marks it as an input table.

### Modals and buttons

| Surface | Page id | Labels seen |
|---|---|---|
| Create | `m.new` `4ycELmnjx0` | Create item, ID code, Generate, Name, L1 category, L2 subcategory, Unit price, Description, I'm lazy, Cancel, Apply |
| Edit | `m.edit` `AbHNggM9KX` | Edit item, I'm lazy, Cancel, Apply |
| Remove item | `m.w.remove_item` `9sHGZpL_mT` | Keep the record, Remove the record |
| Remove record | `m.w.remove_record` `OFF1Z_KsP_` | Keep the record, Remove record |
| Item change log | `m.change_log_item` `6xou4psNjd` | Change log, Approval status, Bulk deny, Bulk approve, Close |

On `m.new`, the Actions panel lists sequences named **On click - primary**, **On click - secondary**, and **On close**. Those three names match Sigma’s modal triggers. The steps inside them were not opened.

### Likely input tables (Logic)

Page `Logic` (`lDcvntEFrg`), section **Input - base tables** (`kKL3xxA6_a`):

| Title | Element id |
|---|---|
| BE - Input - DIM_ITEMS | `HqGah-o9em` |
| BE - Input - DIM_HIERARCHY | `--eOzSv6jo` |

Change-log blocks on the same page, also likely input tables, type not confirmed:

| Title | Element id |
|---|---|
| Change log - requests to add, edit or remove SKU | `nRUE1A9HOC` |
| BE - Item full change log | `fMj5_732_u` |
| BE - hierarchy full change log | `HCkh-uDkKb` |

`BE - Raw - DIM_ITEMS` (`4oIwEn2bPq`) is the raw warehouse block, not an input table. Whether the `BE - Input` tables are empty, CSV, or linked was not read. That type decides whether a manual insert is even available.

## Documented click path

Help: [Create new input tables](https://help.sigmacomputing.com/docs/create-new-input-tables), [Edit input table data](https://help.sigmacomputing.com/docs/add-or-edit-input-table-data), [Input tables overview](https://help.sigmacomputing.com/docs/intro-to-input-tables), [Create actions that modify input table data](https://help.sigmacomputing.com/docs/create-actions-that-modify-input-table-data), [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions).

Quickstarts: [AI Apps Fundamentals](https://quickstarts.sigmacomputing.com/guide/dataaps_fundamentals/index.html), [FP&A report template](https://quickstarts.sigmacomputing.com/guide/use_cases_fpna_report_based_on_template/index.html), [Building Forms](https://quickstarts.sigmacomputing.com/guide/aiapps_forms/index.html).

### Direct edit on an empty or CSV input table

Linked input tables do not support adding rows by hand. Row count comes from the primary key. Manual insert is also blocked when column protection is on for any column.

Insert one row:

1. Right-click anywhere in an existing row.
2. Select **Insert 1 row above** or **Insert 1 row below**.

Or click the last row, the one whose header cell shows **+**, to append one row at the bottom.

Insert multiple empty rows:

1. Multi-select consecutive rows.
2. Right-click the selection.
3. Select **Insert [#] rows above** or **Insert [#] rows below**. The count matches the selection.

Insert multiple rows that already have values: select a cell or range, right-click, **Paste** (or ⌘V / Ctrl+V). Cap is 2,000 rows and 25 columns. Pasting onto a header in a draft writes the first copied row into the header. In a published workbook you cannot edit headers, and the same 2,000 × 25 cap applies, not counting headers.

Update a cell:

1. Select the cell and type. Editable columns show a pencil in the header. Linked columns, calculations, lookups, and system columns are not editable.
2. In a draft, Sigma saves the edit immediately. **Publish** copies it to the published version.
3. In a published workbook, click **Edit data** on the element first. Yellow marks show unsaved cells. Click **Save**.

The edit-data help page documents clearing a checkbox with the Delete key. It does not document a row-delete menu. Two quickstarts do: select the row, right-click, **Delete 1 row**. [AI Apps Fundamentals](https://quickstarts.sigmacomputing.com/guide/dataaps_fundamentals/index.html) uses that on an empty row left by Insert Row with no control values. [FP&A report template](https://quickstarts.sigmacomputing.com/guide/use_cases_fpna_report_based_on_template/index.html) uses it to drop a pasted header row.

### Actions that write an input table

Configure on a trigger element: open the draft (or customize a saved view), select the trigger, open the **Actions** tab, create or locate a sequence, select the default action or **Add action**, set the fields, then **Publish**. The target table must be editable in the published version if viewers will run the action.

[Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions) lists the effects as **Insert row**, **Update row**, and **Delete row**. The configuration page uses **Insert row**, **Insert row(s)**, **Update row(s)**, and **Delete row(s)**. Insert row shipped as Beta on 16 Aug 2024 ([changelog](https://help.sigmacomputing.com/changelog/2024-08-16)). Update row and Delete row shipped as GA on 9 May 2025 ([changelog](https://help.sigmacomputing.com/changelog/2025-05-09)).

Modal triggers, which match the sequence names seen on `m.new`: **On click - primary**, **On click - secondary**, **On close**. A table or input table can also trigger on **On select** or a custom **Cell context menu** item. A button triggers **On click**.

**Insert row** — one new row. **Into** an input table, linked tables excluded. **With values** per column: Static values, Column, Control, or Formula. Leave a column blank with Static values and no value. [AI Apps Fundamentals](https://quickstarts.sigmacomputing.com/guide/dataaps_fundamentals/index.html): on the button’s Actions panel, add an action, select **Insert Row**, map each control to the input table. A control used for insert cannot have Allow multiple selection on, because that yields an array. Empty controls insert an empty row. [Building Forms](https://quickstarts.sigmacomputing.com/guide/aiapps_forms/index.html): creating a Form child of an input table auto-adds two actions on Submit, one to insert a row and one to clear the form.

**Insert row(s)** — one or more rows, linked tables excluded.

- **Insert type: New data.** **Set column values** from Static values, Column, Control, Formula, or an Action variable from an earlier action in the same sequence (Insert row or Call API). Turn on **Insert as multiple rows** to split one multi-value control, form field, or action variable into one row per value, up to 2,000 rows per action. Other column values repeat on every inserted row.
- **Insert type: Source data.** **From** a table or an action variable that returns a list of rows. For a table, **Rows to insert** is All rows, Column value matches criteria, or a formula that is True. **Set column values** can also take a **Source column**.

**Update row(s)** — one or more existing rows in an input table or a linked input table. Only tables created after 23 Apr 2023. **Update row(s) by**:

- **Single row**, matched to the system row ID (input table) or the primary key (linked input table), via Static value, Column, Control, or Formula. If the match hits more than one row, Sigma updates nothing.
- **Formula** that is True or False per row.
- **Column value matches criteria**.

**Update with values**: Static value, Column, Control, or Formula, on editable columns.

**Delete row(s)** — one or more rows. Linked tables excluded. **Delete row(s) by** uses the same Single row / Formula / Column value matches criteria choices. Single row matches the system-generated row ID. A formula or single-row rule that matches multiple rows deletes nothing. Worked example: button, **Delete row(s)**, **In** the input table, **Delete row(s) by** Formula `[Number] > 100` ([example representation](https://help.sigmacomputing.com/docs/example-representation-workbook-with-a-delete-row-action)).

## What this workbook still does not show

The Apply, pencil, trash, Remove the record, and Bulk approve / Bulk deny controls are visible. Their action effects were not read. A proposal that those buttons insert into `BE - Input - DIM_ITEMS`, update a row, or delete a row would be a guess. Bulk approve and Bulk deny sit on the change-log modal; they are not a documented row-delete.

Direct insert and the context-menu delete also depend on table type. If `BE - Input - DIM_ITEMS` or `BE - Input - DIM_HIERARCHY` is linked, the manual insert path does not apply, and Delete row(s) cannot target a linked table. Update row(s) can.

## Proposed commands

Proposals only. Each one drives a documented editor gesture on a titled element. They do not open `m.new` / `m.edit` / `m.w.remove_item` and they do not invent the unread sequences. `--page` is required because this workbook has more than one page. Swap the title for `BE - Input - DIM_HIERARCHY` or a change-log title after that element is confirmed as an empty or CSV input table.

Insert one empty row (right-click, **Insert 1 row below**):

```
sigma-playwrite-cli insert-row --url <workbook-url> --page Logic --title "BE - Input - DIM_ITEMS" --place below
```

Insert many rows with values (select a cell, paste; stop above 2,000 rows or 25 columns):

```
sigma-playwrite-cli insert-rows --url <workbook-url> --page Logic --title "BE - Input - DIM_ITEMS" --file <tsv-path>
```

Edit one cell (select the cell, type; draft saves by itself):

```
sigma-playwrite-cli edit-cell --url <workbook-url> --page Logic --title "BE - Input - DIM_ITEMS" --column <column> --match <column>=<value> --value <text>
```

Delete one row (quickstart menu: select the row, right-click, **Delete 1 row**):

```
sigma-playwrite-cli delete-row --url <workbook-url> --page Logic --title "BE - Input - DIM_ITEMS" --match <column>=<value>
```
