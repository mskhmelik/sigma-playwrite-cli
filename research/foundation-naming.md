# Foundation naming

Source: the Logic page list in `research/00-inventory.md` for workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`. This note records the names on that canvas. It does not rename them.

Sigma’s product words are background only. They explain what a title is. They do not add a title the inventory does not list.

## What Sigma calls the pieces

A workbook contains pages. A page contains elements. Elements include data tables, pivot tables, charts, SQL outputs, buttons, filters, images, and text. See [Lesson one: Basic organization and navigation](https://help.sigmacomputing.com/docs/lesson-one-basic-organization-and-navigation).

A data element (table, pivot table, or chart) is built from a data source. Sources include a warehouse table, a Sigma data model or dataset, an uploaded CSV, custom SQL, another element in the workbook, a join, a union, or a transpose. See [Create a data element](https://help.sigmacomputing.com/docs/create-a-data-element).

An input table is a separate element for typed-in rows. It can be empty, filled from a CSV, or linked to a parent element. Linked input tables keep a primary key back to that parent and do not overwrite the source. See [Input tables overview](https://help.sigmacomputing.com/docs/intro-to-input-tables) and [Create new input tables](https://help.sigmacomputing.com/docs/create-new-input-tables).

Layout elements group other elements and control what is visible. The types are containers, stacks, tabbed containers, modals, drawers, popovers, navigation, single row containers, repeated containers, and forms. See [Intro to layout elements](https://help.sigmacomputing.com/docs/intro-to-layout-elements).

The string people read on a table, pivot, chart, or input table is its element title. See [Customize an element title](https://help.sigmacomputing.com/docs/customize-element-title). A control also has a Control ID, which formulas and SQL reference in square brackets. The Control ID is a field in the control’s Settings. It is separate from the visible label. See [Intro to control elements](https://help.sigmacomputing.com/docs/intro-to-control-elements) and [Reference control values as parameters](https://help.sigmacomputing.com/docs/parameters-in-workbooks).

Sigma does not define a product type named “section bar,” and it does not define the prefixes `BE -`, `sys.`, or `v.`. Those are names this workbook uses. The CLI should match the canvas title, which is the string in the inventory.

## Pages

| Page | Pattern | Role in this workbook |
|---|---|---|
| Logic | plain name | Backend. Data and calculation. |
| App | plain name | Front end. |
| Problem statement | plain name | Narrative. |
| `p.filters` | `p.` prefix | Filter page. |
| `m.new`, `m.edit`, `m.agent`, and the other `m.*` pages | `m.` prefix | Modal pages, including error and warning modals. |

`Logic` is the page name. `BE -` is the prefix on blocks on that page. The page is not titled `BE`.

## Logic, top to bottom

The inventory walks the Logic page (`lDcvntEFrg`) from top to bottom. Six section bars are plain English. They have no `BE -`, `sys.`, or `v.` prefix.

| Section bar | Element id in the inventory | Exact title on the canvas |
|---|---|---|
| System settings | `iv-TJtj2Ed` | System settings |
| Item ID generation | `a7Io66wwMb` | Item ID generation |
| Input - base tables | `kKL3xxA6_a` | Input - base tables |
| Variables | `NgLtB25FQH` | Variables |
| Change log | `nRUE1A9HOC` | Change log - requests to add, edit or remove SKU |
| Output - union changes and original data | none recorded | Output - union changes and original data |

The change-log bar’s plain-English name is Change log. The title on the canvas is the longer string. The output bar has a title and no recorded element id or child block.

Under those bars, the inventory records this order:

1. **System settings.** `sys.company_name`, `sys.company_one_liner`, `sys.company_logo_url`. Then the raw warehouse block `BE - Raw - DIM_ITEMS`.
2. **Item ID generation.** Holds `generated_id_item`. After that bar, still before the input section: `sys.model`, `sys.prompt_system`, and the block `AI function call - Snowflake and Databricks` (`1n8fuwbYvQ`).
3. **Input - base tables.** `BE - Input - DIM_ITEMS` and `BE - Input - DIM_HIERARCHY`.
4. **Variables.** Three narrower bars, then the `v.*` names under each:
   - Variables when item is edited or created (`yVAibQehiL`): `v.id_item_selected`, `v.name_item_selected`, `v.description_selected`, `v.l1_selected`, `v.l2_selected`, `v.metric_selected`, `v.prompt_user`, `v.missing_values_source`.
   - Variables when request is sent for approval (`uGVMv8GidC`): `v.id_item_approval`, `v.id_row_item_approval`.
   - Variables when managing hierarchy (`m-N633tRL3`): `v.id_record`, `v.id_row_hierarchy`.
5. **Change log.** `BE - Item full change log` and `BE - hierarchy full change log`. Two lines of text sit with that section: “Only approved changes flow downstream” and “Hierarchy is not part of approvals.”
6. **Output - union changes and original data.** Section title only.

## Backend blocks

Backend blocks use the prefix `BE - ` (letters B and E, space, hyphen, space). Five titles exist:

| Title | Element id | Where it sits |
|---|---|---|
| BE - Raw - DIM_ITEMS | `4oIwEn2bPq` | Under System settings. Warehouse table of id, name, description, l1_category, l2_subcategory, metric. The note on the block says to replace the data in draft only. |
| BE - Input - DIM_ITEMS | `HqGah-o9em` | Under Input - base tables. |
| BE - Input - DIM_HIERARCHY | `--eOzSv6jo` | Under Input - base tables. |
| BE - Item full change log | `fMj5_732_u` | Under the change-log bar. |
| BE - hierarchy full change log | `HCkh-uDkKb` | Under the change-log bar. |

Two shapes show up:

- `BE - Raw - DIM_ITEMS` and `BE - Input - DIM_*` put a role word (`Raw` or `Input`) between the prefix and an uppercase table name.
- The change-log blocks put the subject after the prefix and end in `full change log`. `Item` is capitalized. `hierarchy` is lowercase. Match those strings as written.

There is no element titled only `RAW`. Raw warehouse data is the block named `BE - Raw - DIM_ITEMS`.

`generated_id_item` and `AI function call - Snowflake and Databricks` are titled blocks on Logic. They do not use the `BE -` prefix.

## System settings and variables

System settings use `sys.` plus a snake_case name:

- `sys.company_name`
- `sys.company_one_liner`
- `sys.company_logo_url`
- `sys.model`
- `sys.prompt_system`

Variables use `v.` plus a snake_case name. The full list is in the Variables section above. `generated_id_item` is the id generator under Item ID generation. It is not a `v.*` name and it is not a `sys.*` name.

The inventory lists these as names on the Logic page. It does not say whether each string is the element title, the control label, or the Control ID. A command that selects by title should pass the string exactly as listed. It should not invent a second id.

## App page

The viz-facing table on the App page (`92MJn5HcRL`) is **Master log of all items**. It has Edit (pencil) and Drop (trash) columns. It does not use the `BE -` prefix.

Other titled pieces on App, separate from that table: New, AI, Log, L1-L2. Greeting text, the company name, and the one-liner are on the page without those titles.

## Proposed CLI conventions

`sigma-playwrite-cli` already addresses a canvas object with `--page` and `--title`. Titles are case-sensitive. These conventions stay in that shape. Nothing here is implemented.

### Settings

Use exact canvas strings. A short role is allowed only when this table maps it.

| Setting | Value |
|---|---|
| `page.backend` | `Logic` |
| `page.app` | `App` |
| `page.filters` | `p.filters` |
| `page.modal` | `m.` plus the rest of the page name (`m.new`, `m.edit`) |
| `title.section` | Plain English, no prefix. One of: `System settings`, `Item ID generation`, `Input - base tables`, `Variables`, `Change log - requests to add, edit or remove SKU`, `Output - union changes and original data`. |
| `title.backend` | Full `BE -` title from the table above. |
| `title.system` | `sys.` plus snake_case. |
| `title.variable` | `v.` plus snake_case. |
| `title.app-log` | `Master log of all items` |

Role settings expand to one title. Unknown roles stop before any edit.

| Setting | Expands to |
|---|---|
| `role=raw-items` | `BE - Raw - DIM_ITEMS` |
| `role=input-items` | `BE - Input - DIM_ITEMS` |
| `role=input-hierarchy` | `BE - Input - DIM_HIERARCHY` |
| `role=item-change-log` | `BE - Item full change log` |
| `role=hierarchy-change-log` | `BE - hierarchy full change log` |
| `role=master-log` | `Master log of all items` on page `App` |
| `role=section-system` | `System settings` |
| `role=section-item-id` | `Item ID generation` |
| `role=section-input` | `Input - base tables` |
| `role=section-variables` | `Variables` |
| `role=section-change-log` | `Change log - requests to add, edit or remove SKU` |
| `role=section-output` | `Output - union changes and original data` |

`role=raw` and `role=RAW` are not settings. They do not expand.

### Commands

Existing commands keep `--title` as the full canvas title:

- `select --page Logic --title "BE - Raw - DIM_ITEMS"`
- `size`, `place`, and `set` use that same title.
- `arrange --page Logic --order` lists titled siblings in the inventory’s top-to-bottom order, using full titles. The raw block appears in that list as `BE - Raw - DIM_ITEMS`.

Proposed commands, not built:

- `select --page Logic --role raw-items` resolves through the role table, then selects that title. `--role` and `--title` together are rejected, so the two cannot disagree.
- `check-names --page Logic` reads titles and reports three breaks: a title that is only `RAW`, a warehouse or input or change-log block that is missing the `BE -` prefix, or a system or variable name that has lost its `sys.` or `v.` prefix. It does not rename anything.
