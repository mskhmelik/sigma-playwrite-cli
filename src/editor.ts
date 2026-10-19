import type { GridArea } from "./place.js";

export type DrawerSize = "small" | "medium" | "large";
export type DrawerToggle = "on" | "off";

/** Passed add-drawer settings. Omitted keys stay as Sigma created them. */
export type DrawerSettings = {
  width?: DrawerSize;
  spacing?: DrawerSize;
  padding?: DrawerToggle;
  elementGap?: DrawerToggle;
  pageOverlay?: DrawerToggle;
  background?: string;
  header?: DrawerToggle;
  closeIcon?: DrawerToggle;
};

/** Browser seam. Unit tests pass a fake. Only the live run opens Chrome. */
export type Editor = {
  findPage(name: string): Promise<void>;
  findElement(title: string): Promise<{ title: string; inputTable: boolean }>;
  setControl(title: string, value: string): Promise<void>;
  clearControl(title: string): Promise<void>;
  clearPageControls(page: string): Promise<void>;
  openModal(page: string): Promise<void>;
  insertRow(title: string): Promise<void>;
  insertRows(title: string, rows: string[][]): Promise<void>;
  editCell(title: string, column: string, value: string): Promise<void>;
  deleteRow(title: string): Promise<void>;
  addPage(name: string): Promise<void>;
  addInputTable(title: string, column: string): Promise<void>;
  /** Add one Text or Date column. The caller skips a name that is already a header. */
  addTypedColumn(title: string, name: string, type: "text" | "date"): Promise<void>;
  /** Add a text control. When `area` is set, move it there without crossing another element. */
  addTextControl(title: string, area?: GridArea): Promise<void>;
  addButton(title: string): Promise<void>;
  addModal(name: string): Promise<void>;
  /** Create the drawer page, then apply only the settings that were passed. */
  addDrawer(name: string, settings: DrawerSettings): Promise<void>;
  setInsertAction(button: string, table: string, column: string, controlTitle: string): Promise<void>;
  /**
   * On click, insert one row into `table`.
   * A button that already has Insert row is edited. A second call does not add another action.
   */
  setInsertRow(button: string, table: string, values: InsertValue[]): Promise<void>;
  /** Rename one column header. A header that is already `name` is left as it is. */
  renameColumn(title: string, column: string, name: string): Promise<void>;
  /** Delete one column header. A header that is already absent is left as it is. */
  deleteColumn(title: string, column: string): Promise<void>;
  /** Delete one canvas element. A title that is already absent is left as it is. */
  deleteElement(title: string): Promise<void>;
  setCloseModal(button: string): Promise<void>;
  setIfElse(
    button: string,
    table: string,
    column: string,
    controlTitle: string,
    modal: string,
    formula: string,
  ): Promise<void>;
  publish(): Promise<void>;
  /** Format the open modal page: extra-small width, footer off, header title, no close icon. */
  styleModalPage(header: string): Promise<void>;
  /** Reuse a text element whose text or title is `sentence`, or add one, then left-align it. */
  ensureModalSentence(sentence: string): Promise<string>;
  /** Reuse a button with this label, or add one. Stretch, Warning fill, Close modal/drawer. */
  ensureModalButton(label: string): Promise<string>;
  /** Column header labels on this element. */
  listColumns(title: string): Promise<string[]>;
  /** Add one system column. The caller skips a label that is already visible. */
  addSystemColumn(title: string, column: string): Promise<void>;
  /** Column names in each GROUP BY, in order. One array per grouping level. */
  groupingKeys(title: string): Promise<string[][]>;
  /**
   * Drag `column` onto the grouping that already shows `withColumn`.
   * The caller checks that this did not start a second grouping.
   */
  groupWith(title: string, column: string, withColumn: string): Promise<void>;
  /**
   * On select of `clickColumn`, set `controlTitle` from `sourceColumn`.
   * Selection is Replace previous selection.
   */
  setOnSelectControl(table: string, clickColumn: string, controlTitle: string, sourceColumn: string): Promise<void>;
  /** Add a single-select column and its choices. The caller skips a column that is already visible. */
  addSelectColumn(title: string, column: string, options: string[]): Promise<void>;
  /** Add one calculated column and commit its Sigma formula. The caller skips a name that is already a header. */
  addCalculation(title: string, column: string, formula: string): Promise<void>;
  /** Add a segmented control titled `title` with these values, in order. */
  addSegmentedControl(title: string, options: string[]): Promise<void>;
  /** Add a date control. The caller skips a canvas title that is already on the page. */
  addDateControl(title: string): Promise<void>;
  /**
   * Add a list control sourced from one table column.
   * Ticks are on or off. The caller skips a canvas title that is already on the page.
   */
  addListControl(
    title: string,
    source: string,
    column: string,
    multiple: DrawerToggle,
    nullOption: DrawerToggle,
    clear: DrawerToggle,
    search: DrawerToggle,
  ): Promise<void>;
  /**
   * Set Value source and Source column on an existing list control.
   * Does not create the control, write its control id, or change its canvas title.
   * Fails when the control is missing.
   */
  setListSource(title: string, source: string, column: string): Promise<void>;
  /**
   * On click, update one row in `table`.
   * The row id comes from `rowIdControl`. `column` is set from `valueControl`.
   */
  setUpdateRow(button: string, table: string, column: string, valueControl: string, rowIdControl: string): Promise<void>;
  /** Place the sentence area, then the button area. */
  stackModalBody(
    sentenceId: string,
    sentenceArea: { rowStart: number; colStart: number; rowEnd: number; colEnd: number },
    buttonId: string,
    buttonArea: { rowStart: number; colStart: number; rowEnd: number; colEnd: number },
  ): Promise<void>;
  /** True when a container's inspector header is this title. Canvas titles do not count. */
  hasContainer(title: string): Promise<boolean>;
  /** True when that container's inner frame is a 1px solid border with 8px corners. */
  containerStyled(title: string): Promise<boolean>;
  /** Paint the border and corners on a container that already has this title. */
  paintContainer(title: string, border: string, radius: string): Promise<void>;
  /** Wrap the named elements. Title is cnt.<handle>. Border and radius are the painted style. */
  addContainer(titles: string[], title: string, border: string, radius: string): Promise<void>;
};

export type InsertValue =
  | { column: string; kind: "control"; control: string }
  | { column: string; kind: "static"; value: string }
  | { column: string; kind: "formula"; formula: string };

export type ValueSource =
  | { kind: "static"; text: string }
  | { kind: "control"; controlKind: "c" | "v"; handle: string }
  | { kind: "column"; column: string };
