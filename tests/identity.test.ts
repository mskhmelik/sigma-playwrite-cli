import assert from "node:assert/strict";
import { test } from "node:test";
import { workbookIdentity } from "../dist/sigma-api.js";

test("workbook identity is the url segment", () => {
  const segment = "AI-app-employee-hierarchy-management-7keBxQslVMwuqz50XUDk1n";
  assert.deepEqual(workbookIdentity(segment), { urlId: segment });
});
