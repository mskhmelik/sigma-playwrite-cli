# Proposed CLI settings

Not built. Beautification is excluded until `visual-guidelines.md` is reviewed.

## Pages and names

From `foundation-pages.md` and `foundation-naming.md`.

- `page.backend` = `Logic`, `page.app` = `App`, `page.filters` = `p.filters`. Modal pages are `m.` plus the rest of the name.
- Titles stay the canvas string. `BE -` is backend. `sys.` is system. `v.` is a variable. Section bars are plain English.
- The caller passes the canvas title. The CLI does not expand a built-in role into a title from this workbook.
- Existing commands stay `select`, `size`, `place`, `set`, and `arrange` with `--page` and `--title`.

## Handles

The reference workbook is one example of the pattern. The CLI does not ship that workbook's control titles, table titles, or column names.

A handle is the name the caller chooses. The canvas title is the prefix plus that handle:

- Variable: `v.<handle>`
- System value: `sys.<handle>`

`item_id` is a handle. The element it addresses is `v.item_id`. A different workbook passes different handles. An unknown handle is a missing element, and the command stops before an edit.

## Generic actions

Every action takes the workbook, the page, and the element the caller names. None of them are bound to a table from the reference app.

- `action --effect navigate --destination <page>`
- `action --effect open-modal --modal <page>`
- `action --effect set-control --handle <handle> --value-as static|control|column`
- `action --effect clear-control --handle <handle>`
- `action --effect clear-control --page-controls <page>`
- `insert-row --title <element>`
- `insert-rows --title <element>`
- `edit-cell --title <element> --column <column>`
- `delete-row --title <element>`

`set-control` writes `v.<handle>`. `--value-as column` also takes the column name on the triggering element. `--value-as control` takes another handle. The caller supplies both. The CLI does not remember which columns an example table had.

A `sequence` is those same effects, in the order given. Variable writes come first when the caller puts them first. The row effect is just another step, aimed at whatever `--title` the caller passes.
