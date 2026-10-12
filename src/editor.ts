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
  setInsertAction(button: string, table: string, column: string, controlTitle: string): Promise<void>;
  publish(): Promise<void>;
};

export type ValueSource =
  | { kind: "static"; text: string }
  | { kind: "control"; handle: string }
  | { kind: "column"; column: string };
