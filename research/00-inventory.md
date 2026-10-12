# Inventory — AI app: reference data management

Read-only. Workbook `AI-app-reference-data-management-6cXMFSl6HDKNYApiEtueaH`. Opened already signed in as Michael. Edit mode was opened and nothing was published or moved.

Theme shown in the editor: **Lumi**.

## Pages

| Page | Id | Role |
|---|---|---|
| Problem statement | `HfBs9BvWoh` | Narrative. No element titles. |
| App | `92MJn5HcRL` | Front end the user sees. |
| Logic | `lDcvntEFrg` | Data and calculation page. |
| m.agent | `RsNb_P5hRa` | Modal. Agent chat. |
| p.filters | `V1IhEqOkBl` | Front-end filter page. |
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

`m.*` pages are separate modal pages. `p.filters` is the filter page. `Logic` is the backend page. `App` is the front end.

## App (`92MJn5HcRL`)

Titles: New, AI, Log, L1-L2.

Also on the page, without those titles: greeting text, company name and one-liner, segmented access control (`manager` / `user`), description search, and the table "Master log of all items" with Edit (pencil) and Drop (trash) columns.

Element ids seen on the page include `YQsJv4AiY4` (company block), `Whxvxy0NiG` (greeting), `qsmkgqm7JG` / `vmUleLRSPG` (New), `SOAgLqI6cv` (AI), `M0Gb0_b6eD` (Log container), `MypYOsLdAp` (Log), `pT8tEsqlZm` (L1-L2).

## Logic (`lDcvntEFrg`)

Section bars and blocks, top to bottom:

- System settings — `iv-TJtj2Ed`
- sys.company_name, sys.company_one_liner, sys.company_logo_url
- BE - Raw - DIM_ITEMS — `4oIwEn2bPq` (table of id, name, description, l1_category, l2_subcategory, metric; note says replace the data in draft only)
- Item ID generation — `a7Io66wwMb` with `generated_id_item`
- sys.model, sys.prompt_system
- AI function call - Snowflake and Databricks — `1n8fuwbYvQ`
- Input - base tables — `kKL3xxA6_a`
- BE - Input - DIM_ITEMS — `HqGah-o9em`
- BE - Input - DIM_HIERARCHY — `--eOzSv6jo`
- Variables — `NgLtB25FQH`
- Variables when item is edited or created — `yVAibQehiL`
- v.id_item_selected, v.name_item_selected, v.description_selected, v.l1_selected, v.l2_selected, v.metric_selected, v.prompt_user, v.missing_values_source
- Variables when request is sent for approval — `uGVMv8GidC`
- v.id_item_approval, v.id_row_item_approval
- Variables when managing hierarchy — `m-N633tRL3`
- v.id_record, v.id_row_hierarchy
- Change log - requests to add, edit or remove SKU — `nRUE1A9HOC`
- BE - Item full change log — `fMj5_732_u`
- BE - hierarchy full change log — `HCkh-uDkKb`
- Only approved changes flow downstream
- Hierarchy is not part of approvals
- Output - union changes and original data

No element is titled only `RAW`. The raw warehouse block is titled `BE - Raw - DIM_ITEMS`. Backend blocks use the `BE -` prefix. Variables use `v.`. System values use `sys.`.

## Other pages — titles only

- m.agent: 🤖 Agent, Reset chat
- p.filters: Name, L1 category, L2 subcategory, Unit price
- m.new: 📝 Create item, ID code *, Generate, Name *, L1 category *, L2 subcategory *, Unit price, USD / each *, Description, I'm lazy, Cancel, Apply
- m.edit: ✏️ Edit item, I'm lazy, Cancel, Apply
- m.manage_hierarchy: 🌲 Manage hierarchy, New L2 subcategory *, New L1 category *, Add to the hierarchy, Show me log, Close
- m.change_log_item: 🔎 Change log, Approval status, Bulk deny, Bulk approve, Close
- m.change_log_hierarchy: 🔎 Hierarchy change log, Close
- m.approvals: ✅ Change request, Decision, Cancel, Apply
- m.err.wrong_id_format: ⛔️ Error, I will follow the convention
- m.err.missing_values: ⛔️ Error, I will populate all fields
- m.err.no_access: ⛔️ Error, I'm going to grind for promotion
- m.w.dup_item: ⚠️ Warning, Take me back, Let me compare, I want to change it
- m.err.dup_hierarchy: ⛔️ Error, I will change L1 or L2 or both
- m.w.remove_item: ⚠️ Warning, Keep the record, Remove the record
- m.w.remove_record: ⚠️ Warning, Keep the record, Remove record

## Actions seen, not expanded

On `m.new`, the Actions panel lists sequences named **On click - primary**, **On click - secondary**, and **On close**. The steps inside those sequences were not expanded. Do not edit them.

## Screenshots already taken

- `research/screenshots/beauty-text-01-logic-sections.png` — Logic top: blue section bar, gray raw container, table
- `research/screenshots/beauty-tables-01-raw-items.png` — same frame, for the table note
- `research/screenshots/beauty-containers-01-app.png` — App page
- `research/screenshots/beauty-controls-01-m-new.png` — Create item modal and the modal format panel (Width Small, Spacing Medium, Padding on, Element gap on)
