export class Exit extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "Exit";
  }
}

export function fail(message: string, code = 1): never {
  throw new Exit(message, code);
}
