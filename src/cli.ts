#!/usr/bin/env node
import { runAddCsv } from "./add-csv.js";
import { isActionCommand, runAction } from "./actions.js";
import { runArrange } from "./arrange.js";
import { runCreate } from "./create.js";
import { runAdd, runSelect, runSet, runSize } from "./edit.js";
import { Exit } from "./errors.js";
import { runPlace } from "./place.js";
import { runRename } from "./rename.js";
import { runSetColumn } from "./set-column.js";
import { runApi } from "./sigma-api.js";

const help = `sigma-playwrite-cli — select, size, and format Sigma workbook elements in logged-in Chrome

USAGE
  sigma-playwrite-cli api <sigma api args...>
  sigma-playwrite-cli arrange --url <workbook-url> [--page <page-name>] --order "Title A,Title B"
  sigma-playwrite-cli place --url <workbook-url> [--page <page-name>] --layout "Title A=1-19:1-25,Title B=19-39:1-13"
  sigma-playwrite-cli select --url <workbook-url> [--page <page-name>] --title <title>
  sigma-playwrite-cli size --url <workbook-url> [--page <page-name>] --title <title> --area <rowStart-rowEnd:colStart-colEnd>
  sigma-playwrite-cli size --url <workbook-url> [--page <page-name>] --title <title> --size <widthxheight>
  sigma-playwrite-cli set --url <workbook-url> [--page <page-name>] --title <title> --set <key=value> [--set <key=value>...]
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type text [--title <title>]
  sigma-playwrite-cli add-page --url <workbook-url> [--page <page-name>] --name <page>
  sigma-playwrite-cli add-modal --url <workbook-url> [--page <page-name>] --name <page>
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type input-table --title <element> --column <name>[:text|date] [--column <name>[:text|date]...]
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type control --kind c|v --handle <name>
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type control --kind c|v --handle <name> --control segmented --option <value> [--option <value>...]
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type button --title <label>
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type container --handle <name> --title <element> [--title <element>...]
  sigma-playwrite-cli add-csv --url <workbook-url> [--page <page-name>] --file <path.csv> --title <table title> --connection <connection name>
  sigma-playwrite-cli rename --url <workbook-url> [--page <page-name>] --title <current title> --name <new title>
  sigma-playwrite-cli set-column --url <workbook-url> [--page <page-name>] --title <table title> --column <column name> [--column <column name>...] --set format=date
  sigma-playwrite-cli group-column --url <workbook-url> [--page <page-name>] --title <element> --column <column> --with <column already in the grouping>
  sigma-playwrite-cli add-column --url <workbook-url> [--page <page-name>] --title <element> --column <system column> [--column <system column>...]
  sigma-playwrite-cli add-column --url <workbook-url> [--page <page-name>] --title <element> --column <column> --type single-select --option <value> [--option <value>...]
  sigma-playwrite-cli set-action --url <workbook-url> [--page <page-name>] --title <button> --effect insert-row --into <table> --column <column> --kind c|v --from-handle <name>
  sigma-playwrite-cli set-action --url <workbook-url> [--page <page-name>] --title <button> --effect close-modal
  sigma-playwrite-cli set-action --url <workbook-url> [--page <page-name>] --title <button> --effect if-else --into <table> --column <column> --kind c|v --from-handle <name> --modal <page>
  sigma-playwrite-cli set-action --url <workbook-url> [--page <page-name>] --title <element> --on-select <column> --effect set-control --kind c|v --handle <name> --from-column <column>
  sigma-playwrite-cli set-action --url <workbook-url> [--page <page-name>] --title <button> --effect update-row --into <table> --column <column> --kind c|v --from-handle <name> --match-kind c|v --match-handle <name>
  sigma-playwrite-cli publish --url <workbook-url>
  sigma-playwrite-cli navigate --url <workbook-url> [--page <page-name>] --destination <page>
  sigma-playwrite-cli open-modal --url <workbook-url> [--page <page-name>] --modal <page>
  sigma-playwrite-cli style-modal --url <workbook-url> --page <modal-page> --header <title> --sentence <text> --button <label>
  sigma-playwrite-cli set-control --url <workbook-url> [--page <page-name>] --kind c|v --handle <name> (--value <text> | --from-kind c|v --from-handle <name> | --column <column>)
  sigma-playwrite-cli clear-control --url <workbook-url> [--page <page-name>] (--kind c|v --handle <name> | --page-controls <page>)
  sigma-playwrite-cli insert-row --url <workbook-url> [--page <page-name>] --title <element>
  sigma-playwrite-cli insert-rows --url <workbook-url> [--page <page-name>] --title <element> --rows <a,b;c,d>
  sigma-playwrite-cli edit-cell --url <workbook-url> [--page <page-name>] --title <element> --column <column> --value <text>
  sigma-playwrite-cli delete-row --url <workbook-url> [--page <page-name>] --title <element>
  sigma-playwrite-cli sequence --url <workbook-url> [--page <page-name>] --step "<command>" [--step "<command>"...]

Sigma CLI stays available until a command edits a workbook. After that, sigma
calls that mention that workbook are refused. select does not edit.

--order is the full list of titled components in one sibling group, top to
bottom. Titles are separated by commas. A title that is missing, or a titled
sibling left out of the list, stops the command before anything is moved.

--layout and --area use exclusive grid lines: rowStart-rowEnd:colStart-colEnd.
place moves every named title. size moves one title. --size is widthxheight in
grid units and keeps the element's current top-left. A page is 24 columns wide,
so full width is 24. A data-page table is 24x10: from column 1 row 3 that is
3-13:1-25. size takes --area or --size, not both.

--set repeats. Keys depend on the element type. text allows content, fill
(theme:<swatch>), padding (on or off), and color (white). color on a text
element uses the top-bar Text color button. An unknown key stops before any change.

--page is required when the workbook has more than one page.

A handle is the caller's suffix. --kind c writes the control id, then the canvas
title, both c.<name>. The user can change that value. --kind v writes v.<name>
the same way. Saving the control id sentence-cases the canvas title, so the
title is written after that field. Page names, button labels, and the name after BE - or FE -
are sentence case. A missing page, handle, kind, or title stops before an edit.
insert-row, insert-rows, edit-cell, and delete-row refuse an element that is
not an input table. sequence runs steps in order and stops at the first failure.

add --type container wraps every --title in one container. The inspector title
is cnt.<handle>. The border is 1px and the corners are Pill. The container is
not moved or resized. A container that already has that title is left as it is.
One --title is enough. The first element is clicked, and each later element is
added with the Meta modifier.

add-page, add-modal, add input-table, add control, add button, and set-action
build a page. An input table title is BE - <Name> or FE - <Name>. Repeat --column
as name, name:text, or name:date, in the order the columns should appear. A bare
name is text. The first column of a new table is text. set-action
insert-row saves Insert row on a button, taking one column from c.<name> or
v.<name>. set-action if-else opens --modal when that column already contains
the control, and otherwise inserts the row. set-action close-modal closes the
modal that holds the button. set-action --on-select stores the clicked row:
--from-column is written into v.<handle> or c.<handle>, replacing the previous
value. A click that stores the row id uses v.id_<clicked column>_selected.
Run add-column, then add control, then set-action. The control id and canvas
title both exist before the action is saved. Publish once after that.
group-column drags --column onto the grouping that already holds --with. Group
column and Add grouping start a second grouping, so this command does not click
them. A column already in that grouping is left there. The element does not
have to be an input table.
add-column shows a system column on an input table. The labels are Row ID,
Last updated at, Last updated by, Created at, and Created by. A column that is
already visible is left as it is. add-column --type single-select adds one
column and its --option values. add control --control segmented uses the same
values. set-action update-row writes --from-handle into --column on the one row
whose id is --match-handle. The new value is a c.<name> control the user
sets, named for the column it writes: c.status into status, c.name into name.
The button writes it onto the row in v.id_<clicked column>_selected. Run add-column, then
add control, then add button, then set-action. Publish once after that. style-modal formats --page as that error modal:
extra-small width, no primary button, no secondary button, and no close icon.
--header is the title. --sentence is left aligned on 1-2:1-13. --button is on
the next row, 2-3:1-13, filled Warning, stretched, and closes the modal.
style-modal does not add the if/else check. In the published view, type the
name, press Enter, then click the button. publish is the only command that publishes.

add-csv uploads a CSV as a table on Add element, Data, Table, CSV. --connection
is required. The canvas title becomes --title, not the file name. rename changes
one canvas title from --title to --name. set-column --set format=date shows each
--column as a date, YYYY-MM-DD.

Chrome must already be running with --remote-debugging-port=9333. Commands reuse
the open workbook tab and do not open or close a tab per command. This tool
never quits Chrome.
`;

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  const value = args[index + 1];
  if (index < 0 || !value || value.startsWith("--")) return undefined;
  return value;
}

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === "--help" || command === "-h") {
  console.log(help);
  process.exit(command ? 0 : 1);
}

if (command === "api") {
  runApi(argv.slice(1));
} else if (command === "arrange") {
  try {
    await runArrange(argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (command === "place") {
  try {
    await runPlace(argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (isActionCommand(command)) {
  try {
    await runAction(command, argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (command === "add-page" || command === "add-modal" || command === "add-column" || command === "group-column" || command === "set-action" || command === "publish") {
  try {
    await runCreate(command, argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (command === "add" && ["input-table", "control", "button", "container"].includes(flagValue(argv.slice(1), "type") ?? "")) {
  try {
    await runCreate(command, argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (command === "add-csv" || command === "rename" || command === "set-column") {
  const run = command === "add-csv" ? runAddCsv : command === "rename" ? runRename : runSetColumn;
  try {
    await run(argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else if (command === "select" || command === "size" || command === "set" || command === "add") {
  const run =
    command === "select" ? runSelect : command === "size" ? runSize : command === "set" ? runSet : runAdd;
  try {
    await run(argv.slice(1));
  } catch (error) {
    if (error instanceof Exit) {
      console.error(error.message);
      process.exit(error.code);
    }
    throw error;
  }
} else {
  console.error(`Unknown command: ${command}`);
  console.error(help);
  process.exit(1);
}
