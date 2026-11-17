export class HinoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HinoteError";
  }
}
