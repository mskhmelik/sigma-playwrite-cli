# Foundation: variables, filters, and controls

- Date: 2026-10-12
- Question: In workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`, which inventory names are backend `v.` / `sys.` values, which are front-end filters, and which are other front-end controls, and how do Sigma’s own docs name those objects?
- Scope: names that appear in `research/00-inventory.md` only. Docs retrieved 2026-10-12 from help.sigmacomputing.com and quickstarts.sigmacomputing.com.
- Workbook page roles from the inventory: `Logic` is the backend page. `App` is the front end. `p.filters` is the filter page. `m.*` pages are modals.

The user calls backend values **V notation**. The workbook writes that prefix in lowercase: `v.`.

Sigma does not document a workbook object called a variable with a `v.` prefix. In Sigma, a value the user sets lives on a **control element**, and formulas refer to it by **Control ID**. Sigma’s own word “variable” means an **action variable**, which exists only while an action sequence runs. Those are different objects. See Evidence.

## Variables

Backend. They sit on the Logic page (`lDcvntEFrg`). The inventory lists them under section titles, not as App-page controls.

### Every `v.` name

Edited or created item (`Variables when item is edited or created`):

- `v.id_item_selected`
- `v.name_item_selected`
- `v.description_selected`
- `v.l1_selected`
- `v.l2_selected`
- `v.metric_selected`
- `v.prompt_user`
- `v.missing_values_source`

Approval request (`Variables when request is sent for approval`):

- `v.id_item_approval`
- `v.id_row_item_approval`

Hierarchy (`Variables when managing hierarchy`):

- `v.id_record`
- `v.id_row_hierarchy`

That is twelve names. No other `v.` title appears in the inventory.

### `sys.` system values

The inventory places these on Logic with the variables. Treat them as the same kind: backend values, not front-end filters.

- `sys.company_name`
- `sys.company_one_liner`
- `sys.company_logo_url`
- `sys.model`
- `sys.prompt_system`

`sys.company_name`, `sys.company_one_liner`, and `sys.company_logo_url` sit under System settings. `sys.model` and `sys.prompt_system` sit later on the same page, next to the AI function-call block.

## Filters

Front end. They limit what the user sees. They are not the Logic-page `v.` values.

Page `p.filters` (`V1IhEqOkBl`). Titles, and only these titles:

- Name
- L1 category
- L2 subcategory
- Unit price

The App page (`92MJn5HcRL`) also has a **description search**. The inventory gives it no element title. The user states that this search uses the **Contains** operator.

Sigma’s text-match filter and text-input control both include Contains. A text-input control’s parameter output is the text string only; the operator is not part of that value. Which of those two Sigma mechanisms the App search uses is not in the inventory.

The inventory does not name a Sigma control type for Name, L1 category, L2 subcategory, or Unit price. A number column’s default data-element filter is a number range, and a text column’s default is a list. That default is a Sigma fact, not a reading of these four titles.

## Controls

Front-end values that are not filters. Buttons, page titles, and warning copy are not controls.

### App page

Segmented access control, values `manager` and `user`. The inventory gives this control no element title. It is separate from the titled buttons New, AI, Log, and L1-L2.

Sigma’s segmented control is single-select, holds one to seven segments, and can switch views without being only a column filter. Targets are optional. A control with no targets can still pass its value into a formula by Control ID.

### `m.new` fields the user types

Inventory titles on `m.new` (`4ycELmnjx0`):

- ID code *
- Name *
- L1 category *
- L2 subcategory *
- Unit price
- USD / each *
- Description

The user’s shorthand maps onto those titles: Name is `Name *`, L1 is `L1 category *`, L2 is `L2 subcategory *`, ID code is `ID code *`, Description is `Description`. “Price” covers two inventory titles, `Unit price` and `USD / each *`. Both stay separate until the workbook shows they are one control.

These titles also appear on `m.new` and are not value fields: 📝 Create item, Generate, I'm lazy, Cancel, Apply.

The Actions panel lists sequences **On click - primary**, **On click - secondary**, and **On close**. Those names match Sigma’s modal triggers. The steps inside were not expanded. Do not treat the sequence names as controls.

### Other typed fields in the inventory

`m.manage_hierarchy`: `New L2 subcategory *`, `New L1 category *`. Nearby titles Add to the hierarchy, Show me log, and Close are buttons.

`m.edit` lists ✏️ Edit item, I'm lazy, Cancel, and Apply only. No field titles are in the inventory, so none are added here.

### Named, not classified

The inventory does not say whether these hold a typed value, filter a table, or only label a button:

- Approval status (`m.change_log_item`)
- Decision (`m.approvals`)

## How Sigma names the same ideas

| This workbook | Sigma object | What the docs say |
|---|---|---|
| `v.*` and `sys.*` on Logic | Not a documented `v.` type. Closest fit is a control used as a parameter. | A control does not need targets. Its value is `[Control-ID]` in a formula. Changing the Control ID breaks existing references. |
| User’s “V notation” | Not Sigma’s “variable” | Action variables (`[Selection/Column]`) last only for the action sequence. To keep a selected value, set a control, then reference that control. |
| Quickstart phrase “control variables” | Text input controls with a Control ID | The file-upload quickstart says “add the control variables” and then adds text inputs and sets Control ID (`Llm`, `Stage`). |
| `p.filters` titles and the App description search | A data-element filter, or a control with a filter target | Column filters can be converted to a page control. The new control targets the element that had the filter. Text match includes Contains. |
| `manager` / `user` | Segmented control | Single value. Manual list, preset, or a column (first 7 values). Control ID is optional to change. |
| Modal text and price fields | Text input, text area, or number input | Text area is the documented way to pass a text prompt into an AI query. Number input returns one number; its filter operator is not in the output. The inventory does not record which type each modal field uses. |

Fundamentals 06 says controls and filters are sometimes the same word, and that controls can also be parameters. That matches the split above: a filter is a control that targets data; a `v.` value is a control (or the same idea) whose job is to hold a value for the Logic page.

Control ID and the element title are different settings. The visible title in this workbook (`v.id_item_selected`, `Name *`) is not evidence of the Control ID. Read Control ID from the control’s Settings tab before any formula or command uses it.

## Evidence

Retrieved 2026-10-12.

1. Control elements cover inputs and filters, including text input, text area, segmented control, and number input. Text input operators include Contains, Starts with, Ends with, and Like. Parameter output for a text input is a single text string; operators are not available with the control value. A segmented control returns one value. — [Intro to control elements](https://help.sigmacomputing.com/docs/intro-to-control-elements), Types of controls and About control IDs.
2. Reference a control by its Control ID in square brackets, `[New-Control-ID]`. The ID is on the Settings tab. Segmented, text input, text area, and number input are single-value types. — [Reference control values as parameters](https://help.sigmacomputing.com/docs/parameters-in-workbooks), Identify the control ID; Reference a single value control value in a formula.
3. A control does not require targets when it is used as a parameter. An existing data-element filter can be converted with More, then Convert to page control. The filtered element becomes a target. Adding a filter target can rename the control to the target column. — [Create and manage a control element](https://help.sigmacomputing.com/docs/create-and-manage-a-control-element), Convert an existing element filter into a control; Specify the target of the control.
4. A segmented control has one to seven single-select segments, a Control ID, an optional Required flag, and optional filter targets. It can switch views of related content. — [Create and configure a segmented control](https://help.sigmacomputing.com/docs/segmented-control), Create a segmented control; Configure the control.
5. Data-element filter types include List, Number range, and Text match. Text match operators include Contains. Defaults: number column → number range; text or logical column → list. One column cannot have two data-element filters. — [Filter data in data elements](https://help.sigmacomputing.com/docs/data-element-filters), Add a filter; Types of filters.
6. Action variables reference `[Selection/…]` or a prior action result. They persist only during the action sequence. To use a selected value later, set a control to that variable and reference the control. — [Use variables in actions](https://help.sigmacomputing.com/docs/use-variables-in-actions), opening sections.
7. Modal triggers are On click - primary, On click - secondary, and On close. Control elements trigger On change when the user changes the value. Effects include Set control value and Clear control. — [Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions), Action triggers; Action effects.
8. A list control, a segmented control, a slider, or a date control can filter. A control can also be referenced from a formula or from SQL. — [Dynamically filter and modify data in Sigma](https://help.sigmacomputing.com/docs/dynamically-filter-and-modify-data-in-sigma), Filter data. Search snippet plus the same claims on the intro and create-control pages above. The full page was not re-fetched after the search result.
9. Control ID is the stable name used in formulas. The quickstart treats “controls” and “filters” as overlapping words, and shows a formula `Switch([f6-c-stack-by], …)` that reads the control’s current value. — [Fundamentals 06: Controls](https://quickstarts.sigmacomputing.com/guide/fundamentals_6_controls_v3/index.html), Control ID and list-values sections.
10. The quickstart heading “Create Admin Page Controls” says to add “control variables” and then creates text input controls and sets Control ID. — [Multi-Modal File Analysis with AI](https://quickstarts.sigmacomputing.com/guide/aiapps_file_uploads_multimodal_ai/index.html), Create Admin Page Controls.

### Search that failed

`https://help.sigmacomputing.com/docs/filter-data-in-data-elements` returned **Page Not Found**. The intro page still says “See Filter data in data elements.” The live page is `https://help.sigmacomputing.com/docs/data-element-filters` (item 5).

Searches on `https://help.sigmacomputing.com/docs` and `https://quickstarts.sigmacomputing.com` otherwise returned the pages cited above.

## Inferences

- Logic titles `v.*` and `sys.*` are the workbook’s parameter-style values. Sigma would store each one as a control (Control ID plus a value), or as a column that reads such a control. The inventory shows titles only.
- The App description search is a text-match filter or a text-input control whose operator is Contains. The inventory does not say which, and does not give it a title.
- `Name *`, `L1 category *`, `L2 subcategory *`, `Description`, and `ID code *` behave like text input or text area. `Unit price` and `USD / each *` behave like number input. Types are not in the inventory.
- `manager` / `user` is a segmented control used as a view switch. Whether it also targets a column is unknown.

## Uncertainty

- Control IDs for every `v.`, `sys.`, filter, and modal field. Titles are not Control IDs until Settings shows they match.
- Sigma control type for each `p.filters` title, and whether those controls are synced copies of controls on App. Synced copies share one Control ID; that was not checked in the workbook.
- Whether `Unit price` on `p.filters` and `Unit price` on `m.new` are the same element, a synced copy, or two elements with the same label.
- What Approval status and Decision are.
- Field titles on `m.edit`. The inventory does not list them.
- Steps inside the three `m.new` action sequences. They were not expanded.
- The full text of “Dynamically filter and modify data in Sigma” was taken from search results, not a second full-page fetch. Claims used from it also appear on the intro and create-control pages.

## Proposed sigma-playwrite-cli settings and commands

The CLI today selects, sizes, places, and sets text-element keys (`content`, `fill`, `padding`, `color`). It has no kind for a Sigma control. These commands are a proposal. They do not exist yet.

Keep one rule: `--page` is required on this workbook. `--title` is the inventory title, not a guessed Control ID. `select` stays read-only. An unknown key stops before any edit. Do not publish.

### Read

`sigma-playwrite-cli read --url <workbook-url> --page <page> --title <title>`

Print kind (`variable`, `filter`, `control`), page, title, Control ID, current value, operator if one is set, and target columns. Refuse if the title is missing or matches more than one element.

For the App description search, which has no title in the inventory, require an explicit flag rather than a guessed title:

`sigma-playwrite-cli read --url <workbook-url> --page App --description-search`

### Variables

Page is `Logic`. Kind is `variable`. Allowed titles are the twelve `v.` names and the five `sys.` names listed above. Any other `v.` or `sys.` title fails before an edit.

Settings, all optional, one `--set key=value` each:

| Key | Allowed value | Notes |
|---|---|---|
| `control-id` | the id shown in Settings | Write only when the user passes it. Never copy it from the title. |
| `value` | text | The current control value. |
| `value-type` | `text`, `number` | Must match the control. Do not invent it from the name. |

Example shape: `set --page Logic --kind variable --title v.prompt_user --set value=<text>`

### Filters

Page is `p.filters`, except the description search, which is on `App`.

Allowed `--title` values on `p.filters`: `Name`, `L1 category`, `L2 subcategory`, `Unit price`.

| Key | Allowed value | Notes |
|---|---|---|
| `operator` | Sigma text-match operators, including `Contains` | Set `Contains` only for the App description search, where the user already named that operator. Leave `p.filters` operators unset until `read` shows them. |
| `value` | the filter text or selected list value | |
| `target-column` | column name the control targets | Read from Targets. Do not guess `name`, `l1_category`, `l2_subcategory`, or `metric` from the label. |
| `control-id` | Settings id | Same rule as variables. |

Example shape: `set --page App --kind filter --description-search --set operator=Contains`

### Controls

Kind is `control`. These are values, so the command refuses button titles (Generate, I'm lazy, Cancel, Apply, Close, and the other button titles in the inventory).

| Place | `--title` | Proposed `--type` | Settings |
|---|---|---|---|
| App | none in the inventory; select the segmented control by `--access-control` | `segmented` | `value` is `manager` or `user` only. `control-id` optional. |
| `m.new` | `ID code *`, `Name *`, `L1 category *`, `L2 subcategory *`, `Description` | `text` until `read` shows text input vs text area | `value` |
| `m.new` | `Unit price`, `USD / each *` | `number` until `read` shows otherwise | `value` is a single number. Do not set the filter operator; Sigma does not return it with a number input. |
| `m.manage_hierarchy` | `New L2 subcategory *`, `New L1 category *` | `text` | `value` |

Example shape: `set --page m.new --kind control --title "Name *" --set value=<text>`

`add` stays limited to text elements until a later change. Do not add a control type to `add` in this proposal. Creating controls would edit the workbook beyond a value change.

Action sequences on `m.new` stay out of `set`. A later command, if one is added, would only list sequence names (`On click - primary`, `On click - secondary`, `On close`) and would not open or rewrite steps.
