export type GroupingPlan = { action: "already" } | { action: "move" } | { action: "refuse"; reason: string };

/** Decide whether `column` still needs to join the grouping that already holds `withColumn`. */
export function planGrouping(levels: string[][], column: string, withColumn: string): GroupingPlan {
  if (column === withColumn) {
    return { action: "refuse", reason: "The column and the grouping key are the same." };
  }
  const homes = levels.filter((keys) => keys.includes(withColumn));
  if (homes.length === 0) {
    return {
      action: "refuse",
      reason: `No grouping contains ${JSON.stringify(withColumn)}. Group column and Add grouping start a second grouping.`,
    };
  }
  if (homes.length > 1) {
    return { action: "refuse", reason: `${JSON.stringify(withColumn)} is in more than one grouping.` };
  }
  if (homes[0].includes(column)) return { action: "already" };
  return { action: "move" };
}

/** Empty when the column joined the same grouping and no new grouping level appeared. */
export function groupingLanded(before: string[][], after: string[][], column: string, withColumn: string): string | null {
  if (after.length > before.length) {
    return "Started a second grouping. The column has to land on the existing group.";
  }
  const home = after.find((keys) => keys.includes(withColumn));
  if (!home?.includes(column)) {
    return `${JSON.stringify(column)} is not in the same grouping as ${JSON.stringify(withColumn)}.`;
  }
  return null;
}
