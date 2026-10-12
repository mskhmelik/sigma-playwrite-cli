export async function runSequence(steps: Array<() => Promise<void>>): Promise<void> {
  for (const step of steps) {
    await step();
  }
}
