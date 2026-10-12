# Beauty — text section bars

Draft notes from one screenshot and the Logic inventory. These are visible rules for review. They are not locked CLI settings.

## What the screenshot shows

On the Logic page of **AI app: reference data management** (Draft, theme **Lumi**), the top of the canvas is a full-width blue bar that reads **System settings**. The label is white, bold, and left-aligned, with a gap between the words and the left edge of the bar. The bar is one line tall. Its corners are slightly rounded: softer than a square, and not a pill. No separate border shows; the blue fill is the edge. A small white gap sits under the bar, then a row of controls: `sys.company_name`, `sys.company_one_liner`, and `sys.company_logo_url`, with lighter fields for Big Buys and Utilities. The bar does not contain those controls.

Further down the same frame, the blocks change. **BE – Raw – DIM_ITEMS** and **Item ID generation** are light gray containers with titles, not blue bars. Lower still, `sys.model`, `sys.prompt_system`, and **AI function call – Snowflake and Databricks** are the same kind of gray block. This frame does not show an **Input - …** bar. That title is on the Logic page, below this crop.

![System settings bar on the Logic page](screenshots/beauty-text-01-logic-sections.png)

Image file: `research/screenshots/beauty-text-01-logic-sections.png`

## Fill, border, radius, alignment, neighbors

| What you can see | On the System settings bar |
|---|---|
| Fill | One solid blue. No gradient, no second tone. |
| Text color | White. Bold. |
| Border | None visible. |
| Corner radius | Slightly rounded. Not square. Not a pill. |
| Alignment | Label starts at the left, inset from the edge. One line. |
| Height | Short. The bar hugs that single line. |
| Neighbors | Directly above the company controls, with a small gap. Gray data containers begin below that row. |

The bar is not selected in the shot, so the Format panel does not show the live Background, Border, Corner, Padding, or Alignment values. Do not treat the colors or the radius as measured settings.

## Logic page — section bar ids

Page id: `lDcvntEFrg`. From `research/00-inventory.md`, the titled blocks on Logic, top to bottom. Only **System settings** is the blue bar in this screenshot. The inventory lists the rest as section bars and blocks; this crop does not show their fill.

| Title | Element id | In this screenshot |
|---|---|---|
| System settings | `iv-TJtj2Ed` | Yes. The blue bar. |
| BE - Raw - DIM_ITEMS | `4oIwEn2bPq` | Yes. Gray container, not the blue bar. |
| Item ID generation | `a7Io66wwMb` | Yes. Gray container. |
| AI function call - Snowflake and Databricks | `1n8fuwbYvQ` | Partly. Gray container. |
| Input - base tables | `kKL3xxA6_a` | No. This is the Input-style section title. |
| BE - Input - DIM_ITEMS | `HqGah-o9em` | No. |
| BE - Input - DIM_HIERARCHY | `--eOzSv6jo` | No. |
| Variables | `NgLtB25FQH` | No. |
| Variables when item is edited or created | `yVAibQehiL` | No. |
| Variables when request is sent for approval | `uGVMv8GidC` | No. |
| Variables when managing hierarchy | `m-N633tRL3` | No. |
| Change log - requests to add, edit or remove SKU | `nRUE1A9HOC` | No. |
| BE - Item full change log | `fMj5_732_u` | No. |
| BE - hierarchy full change log | `HCkh-uDkKb` | No. |

The inventory also names three lines with no element id: "Only approved changes flow downstream", "Hierarchy is not part of approvals", and "Output - union changes and original data".

## How Sigma documents the settings

Element fill, border, corner, padding, and vertical text alignment are one place. Text color and left/center/right alignment are another. Workbook theme can set defaults for both. Nothing below is a value to copy into the CLI.

### Help

[Customize element background and styles](https://help.sigmacomputing.com/docs/customize-element-background-and-styles) — select the element, then **Format → Element style**:

- **Padding** is a checkbox. Maps and images cannot take padding. A border on a text element requires padding first.
- **Background color** is a dropdown: hex, palette, or picker. **None** clears it to transparent.
- **Border** defaults to **None**, or 1, 2, or 3 pixels, plus a color.
- **Corner** is **square**, **round**, or **pill**.
- **Alignment** on a text element is top, center, or bottom. That is vertical placement inside the element, not left/center/right.

[Text elements](https://help.sigmacomputing.com/docs/text-elements) — add with **UI → Text**. Color, bold, and italics are on the toolbar after the text is highlighted. **Text color** uses the picker, dropper, or palette. **Left align**, **Center align**, and **Right align** move the selected text. **Highlight color** is a separate mark behind the words, not the element fill. Presets run from Large heading down to Small paragraph. New text starts as Medium paragraph.

[Create and manage workbook themes](https://help.sigmacomputing.com/docs/create-and-manage-workbook-themes) — theme **Text** sets workbook text color. **Surface** sets element backgrounds, borders, and icons. Layout **Corner** is square, rounded, or pill, and the documented default is round. **Data element style → Padding** and **Background** are theme-level, with Background **Auto** matching the theme.

### Quickstarts

[Fundamentals 11: Pixel Perfect Reporting](https://quickstarts.sigmacomputing.com/guide/fundamentals_11_pixel_perfect_reporting/index.html) — a **UI → Text** element can take a background color as styling, and the element can be resized. In the same guide, **Format** is used to turn padding on and set a 1px black border; that step is on the selected table, not on the text element. Report **LAYOUT** also has a Padding control. This page does not set corner radius on text.

[Fundamentals 07: Design Elements (UI & Layout)](https://quickstarts.sigmacomputing.com/guide/fundamentals_7_design_v3/index.html) — **Text** is added from **UI** on the element bar. Theme **COLOR** sets **Text**, **Highlight**, and **Surface**. Theme **LAYOUT STYLE** has a Padding checkbox (the guide unchecks it). This is workbook theme styling, not the Element style panel on one text element. It does not document corner radius for a text element.

[Build an Interactive Storefront with Repeaters and Actions](https://quickstarts.sigmacomputing.com/guide/aiapps_storefront_repeaters/index.html) — a text element is formatted to a lighter color for a category label. The `#FFFFFF` background in that guide is set on a container, not on the text element.

Search on `quickstarts.sigmacomputing.com` did not return a page that sets **Corner** (square, round, or pill) on a text element. Corner shape is documented on the help page above.

## Draft for review

Visible rules only. Not locked.

- The section label is a full-width bar, separate from the controls under it.
- Fill is one solid blue.
- The label is white and bold.
- The label is left-aligned, inset from the left edge.
- Corners are slightly rounded.
- No border is visible.
- The bar is one line tall.
- A small gap separates the bar from the controls beneath it.
