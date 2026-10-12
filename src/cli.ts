#!/usr/bin/env node
import { runArrange } from "./arrange.js";
import { runAdd, runSelect, runSet, runSize } from "./edit.js";
import { Exit } from "./errors.js";
import { runPlace } from "./place.js";
import { runApi } from "./sigma-api.js";

const help = `sigma-playwrite-cli — select, size, and format Sigma workbook elements in logged-in Chrome

USAGE
  sigma-playwrite-cli api <sigma api args...>
  sigma-playwrite-cli arrange --url <workbook-url> [--page <page-name>] --order "Title A,Title B"
  sigma-playwrite-cli place --url <workbook-url> [--page <page-name>] --layout "Title A=1-19:1-25,Title B=19-39:1-13"
  sigma-playwrite-cli select --url <workbook-url> [--page <page-name>] --title <title>
  sigma-playwrite-cli size --url <workbook-url> [--page <page-name>] --title <title> --area <rowStart-rowEnd:colStart-colEnd>
  sigma-playwrite-cli set --url <workbook-url> [--page <page-name>] --title <title> --set <key=value> [--set <key=value>...]
  sigma-playwrite-cli add --url <workbook-url> [--page <page-name>] --type text [--title <title>]

Sigma CLI stays available until a command edits a workbook. After that, sigma
calls that mention that workbook are refused. select does not edit.

--order is the full list of titled components in one sibling group, top to
bottom. Titles are separated by commas. A title that is missing, or a titled
sibling left out of the list, stops the command before anything is moved.

--layout and --area use exclusive grid lines: rowStart-rowEnd:colStart-colEnd.
place moves every named title. size moves one title.

--set repeats. Keys depend on the element type. text allows content, fill
(theme:<swatch>), padding (on or off), and color (white). color on a text
element uses the top-bar Text color button. An unknown key stops before any change.

--page is required when the workbook has more than one page.

Chrome must already be running with --remote-debugging-port=9222. This tool
never quits Chrome.
`;

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
