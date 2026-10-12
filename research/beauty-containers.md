# Beauty — containers and page layout

Visual notes for workbook **AI app: reference data management** (inventory id `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`). The editor is in Draft. The right-hand panel shows theme **Lumi**, with **Settings** selected and **Workbook settings** available. The container and page Format sections are closed in both shots, so Spacing, Padding, Element gap, Border, Corner, Page width, and background color are described only as what the pixels show. None of those controls are locked.

Inventory: `research/00-inventory.md`. App page id `92MJn5HcRL`. Logic page id `lDcvntEFrg`.

## Screenshots

![App page: centered header card, search row, and table card](screenshots/beauty-containers-01-app.png)

`/Users/michael.khmelik/dev/sigma-playwrite-cli/research/screenshots/beauty-containers-01-app.png`

![Logic page: gray container around BE - Raw - DIM_ITEMS](screenshots/beauty-text-01-logic-sections.png)

`/Users/michael.khmelik/dev/sigma-playwrite-cli/research/screenshots/beauty-text-01-logic-sections.png`

## App — centering, stacking, spacing

The canvas behind the content is a light neutral gray. The workbook content is one column, centered between the left element bar and the right settings panel, with matching empty space on the left and the right. The column is narrower than that canvas.

Three bands share the column’s left and right edges, stacked from top to bottom. The vertical gap between the first and second band matches the gap between the second and third, and that gap is larger than the padding inside the two cards.

1. **Header card.** White surface, a light edge, a slight shadow, and rounded corners. Inside one card edge: the logo at the left; the blue underlined title **Electric Avenue Electronics** and the one-liner **The street where technology lives**; a `manager` / `user` segmented control at the right, with `manager` filled; then the greeting **Hello Michael. Your access level is manager. You have 0 request(s) to check in log.** Inventory lists the company block as `YQsJv4AiY4` and the greeting as `Whxvxy0NiG`. The capture shows one card boundary around both.
2. **Search row.** Same width as the cards, with no fill of its own. Left to right: a **Contains** dropdown, a **Description search** field, a filter icon, a blue **AI** button, and a blue **New** button. Inventory ids for the buttons include `SOAgLqI6cv` (AI) and `qsmkgqm7JG` / `vmUleLRSPG` (New).
3. **Table card.** White surface, a light edge, a slight shadow, and rounded corners, titled **Master log of all items**. **L1-L2** (`pT8tEsqlZm`) and **Log** (`MypYOsLdAp`, inside container `M0Gb0_b6eD`) sit at the top right of the card. The table fills the rest of the card: ID, Name, Description, L1 category, L2 category, Unit price, USD/each, Edit, and Drop.

The page Format panel is closed, so this centered column matches either a page width below Full or a full-width page whose elements occupy the middle of the grid. Page width is left unset.

Sigma names the width control in two places. Per page, Format → **Page style** → **Page width** is **Full**, **Large**, **Medium**, or **Custom** (a pixel width). That value replaces the workbook-level **Layout style** page width, whose default is **Full**. See [Workbook page settings overview](https://help.sigmacomputing.com/docs/workbook-page-settings-overview) and [Workbook settings overview](https://help.sigmacomputing.com/docs/workbook-settings-overview).

Stacking and the gap between bands are grid placement, not a named “center” toggle. [Design workbook layouts](https://help.sigmacomputing.com/docs/design-workbook-layouts) describes drag, resize, and a vertical resizer that adds or removes space between elements. In the code representation, a page is a 24-column grid: `gridColumn="1 / 25"` spans the full width, and a narrower span insets an element. See [Customize the layout of a workbook in code representation (Beta)](https://help.sigmacomputing.com/docs/customize-the-layout-of-a-workbook-in-code-representation).

## Logic — gray fill, border, radius

On **Logic**, the top of the page stacks in this order:

- **System settings** (`iv-TJtj2Ed`) is a solid blue bar with white text, spanning the content width. The corners look square.
- Under the bar, on the page surface: `sys.company_name` (**Electric Avenue Electronics**), `sys.company_one_liner` (**The street where technology lives**), `sys.company_logo_url` (**Electronics retail**), then **Big Buys** and **Utilities**. These controls sit outside the gray raw region.
- **BE - Raw - DIM_ITEMS** (`4oIwEn2bPq`) is a light gray filled region. Inventory names this block exactly; no element is titled only `RAW`. Inside the fill: the title with an **Editable in draft** menu, the note **Replace the data in this table if you need, do NOT change the column names**, and the white items table (id, name, description, l1_category, l2_subcategory, metric). Padding is visible between the gray edge and the title, and between the note and the table.
- The gray fill shows no stroke. The corners meet the page square, with no visible radius.
- **Item ID generation** (`a7Io66wwMb`) uses the same kind of gray fill around `generated_id_item` (value `null`).
- Beneath that, two white blocks sit side by side: `sys.model` (**claude-sonnet-4-6**) and `sys.prompt_system` on the left, and **AI function call - Snowflake and Databricks** (`1n8fuwbYvQ`) on the right. They are outside the gray raw fill.

A container’s **Background color** is the fill. **Border** defaults to none and can be set to 1, 2, or 3 pixels with a color. **Corner** is square, round, or pill, and defaults to round. See [Use containers to organize workbook layouts](https://help.sigmacomputing.com/docs/use-containers-to-organize-workbook-layouts). Because the published default corner is round, a square-looking edge in this capture is a visual reading. Border and Corner stay unset until the Format panel for `4oIwEn2bPq` is opened.

## Doc names for the same controls

These are the published control names. They are not values taken from this workbook.

Container Format → **Layout style**, from [Use containers to organize workbook layouts](https://help.sigmacomputing.com/docs/use-containers-to-organize-workbook-layouts):

| Style | Published behavior |
| --- | --- |
| Spacing | Space between elements in the container. When Padding is on, Spacing also sets that padding. |
| Padding | On by default. Off removes padding between the elements and the container edge. |
| Background color | Fill for the container. Conditional rules are allowed; the first true rule wins. |
| Border | Defaults to none. Can be 1, 2, or 3 pixels, with a color. |
| Corner | Square, round, or pill. Defaults to round. |
| Element gap | On by default. Off removes the padding between elements. |

Modal Format → **Modal style**, from [Use modals to create focused content views](https://help.sigmacomputing.com/docs/use-modals-to-create-focused-content-views):

| Style | Published behavior |
| --- | --- |
| Width | Default **Small**. Choices: Extra small, Small, Medium, Large, Extra large. |
| Spacing | Space around the outside of the modal and between rows. **Small**, **Medium** (default), or **Large**. |
| Padding | On by default. Off removes padding between elements and the modal. |
| Background color | Modal fill. It does not paint the footer. |
| Element gap | On by default. Off removes all space between elements. |

Workbook **Layout style** also sets Spacing, Corner (default round), and data-element Padding for the workbook as a whole ([Workbook settings overview](https://help.sigmacomputing.com/docs/workbook-settings-overview)). [Fundamentals 07: Design Elements (UI & Layout)](https://quickstarts.sigmacomputing.com/guide/fundamentals_7_design_v3/index.html) treats Padding as a Layout style checkbox and treats a container as a named group that moves and styles together.

Inventory already notes a third screenshot, `research/screenshots/beauty-controls-01-m-new.png`, where the Create item modal format panel showed Width Small, Spacing Medium, Padding on, and Element gap on. That panel was not re-opened for this note, so those four readings stay unconfirmed and unlocked.

## Search

Searches of `https://help.sigmacomputing.com/docs` and `https://quickstarts.sigmacomputing.com` for containers, modals, padding, element gap, and page layout all returned pages. No search failed.

## Draft for review

Visible rules only. Accept, reject, or replace after a Format panel is opened.

1. App content is one centered column, narrower than the canvas, with matching space on the left and the right.
2. That column stacks three bands that share the same left and right edges: header card, search row, master-log table card.
3. The vertical gap between those bands is even, and larger than the padding inside the two cards.
4. The header and the table are white cards with a light edge, a slight shadow, and rounded corners.
5. The search row sits in that same column and has no card fill of its own.
6. The header card holds the logo, company name, one-liner, `manager` / `user` control, and the greeting inside one visible edge.
7. The table card holds **Master log of all items** at the left, **L1-L2** and **Log** at the right, and the table below them.
8. On Logic, **BE - Raw - DIM_ITEMS** is a light gray fill around the title, the draft-only note, and the table, with padding inside the fill.
9. That gray fill shows no border and no corner radius.
10. **System settings** is a blue bar with square-looking corners. The company controls under it sit on the page, outside the gray fill.
11. **Item ID generation** uses the same gray fill. The model/prompt block and **AI function call - Snowflake and Databricks** sit side by side under it, on white.
12. Spacing, Padding, Element gap, Border, Corner, Page width, and any background hex stay unset.
