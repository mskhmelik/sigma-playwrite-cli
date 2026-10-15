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
  addTextControl(title: string): Promise<void>;
  addButton(title: string): Promise<void>;
  addModal(name: string): Promise<void>;
  setInsertAction(button: string, table: string, column: string, controlTitle: string): Promise<void>;
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
  /** Add a segmented control titled `title` with these values, in order. */
  addSegmentedControl(title: string, options: string[]): Promise<void>;
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
  /** Wrap the named elements. Title is cnt.<handle>. Border and radius are the painted style. */
  addContainer(titles: string[], title: string, border: string, radius: string): Promise<void>;
};

export type ValueSource =
  | { kind: "static"; text: string }
  | { kind: "control"; controlKind: "c" | "v"; handle: string }
  | { kind: "column"; column: string };
