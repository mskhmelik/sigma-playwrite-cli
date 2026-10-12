# Actions and state — V notation

Read from names in [00-inventory.md](00-inventory.md) for workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`. No element formula was opened. Action sequences on `m.new` were listed and not expanded. The precompute below is inferred from the section layout.

V notation is the lowercase `v.` prefix on control titles. It is this workbook’s naming, separate from Sigma’s action variable `Selection`.

## Pre-built blocks

On Logic (`lDcvntEFrg`) the section bars already hold the pipeline, top to bottom:

| Block | Id |
|---|---|
| BE - Raw - DIM_ITEMS | `4oIwEn2bPq` |
| BE - Input - DIM_ITEMS | `HqGah-o9em` |
| BE - Input - DIM_HIERARCHY | `--eOzSv6jo` |
| Change log - requests to add, edit or remove SKU | `nRUE1A9HOC` |
| BE - Item full change log | `fMj5_732_u` |
| BE - hierarchy full change log | `HCkh-uDkKb` |
| Only approved changes flow downstream | (section title only) |
| Output - union changes and original data | (section title only) |

`BE -` marks backend blocks. The raw warehouse block is `BE - Raw - DIM_ITEMS` (columns named id, name, description, l1_category, l2_subcategory, metric). Nothing on the page is titled only `RAW`.

Those blocks sit on the page as finished sections. A click is not what assembles them. The layout puts raw data, input tables, change logs, the downstream approval gate, and the union output in place first. The `v.` controls sit in the middle of that layout, so a click can write them and the tables that are already there can filter on them.

Hierarchy is not part of approvals is its own section title between the gate and the union. The item path and the hierarchy path are separate in the names.

## Variables grouped by moment

Parent section: Variables (`NgLtB25FQH`). Three child groups, each named for the moment a click is in:

**Variables when item is edited or created** (`yVAibQehiL`)

- `v.id_item_selected`
- `v.name_item_selected`
- `v.description_selected`
- `v.l1_selected`
- `v.l2_selected`
- `v.metric_selected`
- `v.prompt_user`
- `v.missing_values_source`

The create modal (`m.new`) and the edit modal (`m.edit`) are the pages for this moment. Modal field titles line up with the same group: ID code, Name, L1 category, L2 subcategory, Unit price, Description.

**Variables when request is sent for approval** (`uGVMv8GidC`)

- `v.id_item_approval`
- `v.id_row_item_approval`

The one-request modal (`m.approvals`) and the item change-log modal (`m.change_log_item`) are the pages for this moment. The pair of names holds an item id and a row id.

**Variables when managing hierarchy** (`m-N633tRL3`)

- `v.id_record`
- `v.id_row_hierarchy`

The hierarchy modal (`m.manage_hierarchy`) and the hierarchy change-log modal (`m.change_log_hierarchy`) are the pages for this moment. The pair of names holds a hierarchy record id and a row id.

`sys.` is the other prefix on Logic (company name, one-liner, logo, model, prompt). Those are settings, not the click state.

## What a click writes

The `v.` controls are the selected item, the approval ids, and the hierarchy record ids. A click writes those controls. The tables built above and below them are what filter on the written values.

Sigma’s own mechanism, from the docs below, fits that shape:

- A table trigger is **On select** on one column. A modal trigger is **On click - primary**, **On click - secondary**, or **On close**. The sequences already named on `m.new` use those three modal names. Their steps were not opened.
- **Set control value** updates one control in the current workbook. **Set value as** can be Static values, Column (from the trigger table, pivot, input table, or visualization), Control, or Formula. **Set control selection to** can Replace, Add to, or Remove from the current selection.
- **Clear control** clears one control, a container, a tab, a page or modal, or the whole workbook.
- A cross-element filter is three pieces: a trigger, a control, and a target. The action sets the control. The control’s **Targets** tab says which element and column that value filters. One control can target many elements for a single dimension. Each extra dimension needs its own control and its own action.
- A control can also have no target and be referenced from a calculated column or custom SQL. Which of those this workbook uses was not read. No lookup formula is claimed.
- Action variable `Selection` exists only while the sequence runs, and only inside action formulas and conditions. Sigma’s doc says that a value needed outside the sequence is written onto a control, and later formulas read the control. That is the role of the `v.` titles: they outlive the click so Logic’s already-built tables can filter on them.

App (`92MJn5HcRL`) is where the click starts. Master log of all items has an Edit (pencil) column and a Drop (trash) column. `p.filters` holds Name, L1 category, L2 subcategory, and Unit price. Those are the front-end filters, a different group from the `v.` state on Logic.

## Docs cited

- [Create actions that manage control values](https://help.sigmacomputing.com/docs/create-actions-that-manage-control-values) — Set control value and Clear control.
- [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions) — On select, modal click triggers, and the Controls effects.
- [Create cross-element filters](https://help.sigmacomputing.com/docs/create-cross-element-filters) — trigger sets a control; the control filters the target.
- [Create and manage a control element](https://help.sigmacomputing.com/docs/create-and-manage-a-control-element) — Targets tab, filter target column, control-as-parameter.
- [Dynamically filter and modify data in Sigma](https://help.sigmacomputing.com/docs/dynamically-filter-and-modify-data-in-sigma) — controls as workbook filters, and controls referenced from formulas or SQL.
- [Use variables in actions](https://help.sigmacomputing.com/docs/use-variables-in-actions) — `Selection` lasts for the sequence; persist a selected value by setting a control.

## Proposed commands

These commands do not exist yet. They follow the current flag style (`--url`, `--page`, `--title`). Each `set-control` step is ordered before any Insert row, Update row, or Delete row in the same sequence. Column bindings below are proposed from titles in the inventory. They are not a reading of an action that was opened. The row target stays a placeholder because those steps were not expanded.

`--selection replace` matches Set control selection to → Replace previous selection. `--value-as column` matches Set value as → Column.

Edit or create, from the master-log pencil, before the row step:

```
sigma-playwrite-cli sequence \
  --url <workbook-url> \
  --page App \
  --title "Master log of all items" \
  --trigger on-select \
  --when-clicking Edit \
  --name "On select" \
  --step "set-control v.id_item_selected value-as=column source-column=id selection=replace" \
  --step "set-control v.name_item_selected value-as=column source-column=name selection=replace" \
  --step "set-control v.description_selected value-as=column source-column=description selection=replace" \
  --step "set-control v.l1_selected value-as=column source-column=l1_category selection=replace" \
  --step "set-control v.l2_selected value-as=column source-column=l2_subcategory selection=replace" \
  --step "set-control v.metric_selected value-as=column source-column=metric selection=replace" \
  --step "row <insert|update|delete> --table <BE input or item change log>"
```

`v.prompt_user` and `v.missing_values_source` belong to the same moment. No source column for them is named in the inventory, so they are separate writes:

```
sigma-playwrite-cli sequence \
  --url <workbook-url> \
  --page m.new \
  --title "📝 Create item" \
  --trigger on-click-primary \
  --name "On click - primary" \
  --step "set-control v.prompt_user value-as=control source-control=<prompt control on m.new> selection=replace" \
  --step "set-control v.missing_values_source value-as=static value=<source label> selection=replace" \
  --step "row <insert|update> --table <BE input or item change log>"
```

Approval, before the row step. Source columns are not in the inventory; the two control titles are.

```
sigma-playwrite-cli sequence \
  --url <workbook-url> \
  --page m.change_log_item \
  --title "🔎 Change log" \
  --trigger on-select \
  --when-clicking <decision column> \
  --name "On select" \
  --step "set-control v.id_item_approval value-as=column source-column=<item id column> selection=replace" \
  --step "set-control v.id_row_item_approval value-as=column source-column=<row id column> selection=replace" \
  --step "row <update> --table <BE - Item full change log>"
```

Hierarchy, before the row step:

```
sigma-playwrite-cli sequence \
  --url <workbook-url> \
  --page m.manage_hierarchy \
  --title "🌲 Manage hierarchy" \
  --trigger on-click-primary \
  --name "On click - primary" \
  --step "set-control v.id_record value-as=column source-column=<record id column> selection=replace" \
  --step "set-control v.id_row_hierarchy value-as=column source-column=<row id column> selection=replace" \
  --step "row <insert|update|delete> --table <BE - Input - DIM_HIERARCHY or BE - hierarchy full change log>"
```

Clear is the matching reset, scoped to one control, and also ordered before a later row step when the sequence both clears and writes:

```
sigma-playwrite-cli sequence \
  --url <workbook-url> \
  --page <page> \
  --title <trigger title> \
  --trigger <on-select|on-click-primary|on-close> \
  --name "<sequence name>" \
  --step "clear-control v.id_item_selected apply-to=specific-control" \
  --step "row <insert|update|delete> --table <target>"
```
