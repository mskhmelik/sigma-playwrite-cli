# Visual guidelines — draft for review

These are what the screenshots show. Nothing here is a CLI setting yet. The four notes behind this page are `beauty-text.md`, `beauty-containers.md`, `beauty-tables.md`, and `beauty-controls.md`.

Theme in the editor: **Lumi**.

## App page

![App page](screenshots/beauty-containers-01-app.png)

The page is one centered column, narrower than the canvas.

- Header and the master log are white cards with a light edge, a slight shadow, and rounded corners.
- The search row sits in that same column and is not itself a card.
- The header card holds the logo, the blue underlined company name, the one-liner, the `manager` / `user` segment, and the greeting.
- The table card holds **Master log of all items** on the left, outline **L1-L2** and **Log** on the right, then the table.
- **AI** and **+ New** are filled blue with white text.
- The selected segment (`manager`) is a light blue fill. `user` is white with gray text.
- Edit is a gold pencil. Drop is a gray trash icon.
- The master log has a light header, faint row striping, and a summary footer (1,157 rows, 10 columns, plus two named counts).

## Logic page

![Logic sections and the raw table](screenshots/beauty-text-01-logic-sections.png)

- **System settings** is a full-width bar, solid blue, white bold left-aligned label, one line tall, no visible border. A small gap sits under it. One note calls the corners slightly rounded; another calls them square. That is open.
- Company controls sit on the page under the bar, not inside a gray card.
- **BE - Raw - DIM_ITEMS** and **Item ID generation** are light gray fills with padding, a bold dark title, and no obvious border. Whether that gray has a corner radius is open.
- The raw table has a light header, horizontal rules, no obvious row banding, and a summary of 1,157 rows and 6 columns.
- **sys.model** / **sys.prompt_system** and **AI function call** sit side by side on white under the gray cards.

## Create item modal

![Create item modal](screenshots/beauty-controls-01-m-new.png)

The format panel on this page reads Width **Small**, Spacing **Medium**, Padding **on**, Element gap **on**.

- **Generate** and **I'm lazy** are filled blue, white text.
- **Cancel** is filled red, white text.
- **Apply** is filled green, white text.
- Inputs are white with a light gray border. Required asterisks are red.
- The blue rectangle around the modal is the editor selection, not the modal’s own border.

## Open before any styling command

- Is the blue bar’s corner Round or Square?
- Is the gray Logic fill the element background or a parent container, and does it have a radius?
- Is the master log’s alternate gray table banding or a conditional format?
- Are Edit and Drop text buttons, or action columns?
