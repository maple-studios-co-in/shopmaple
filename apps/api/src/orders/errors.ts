export class OrderFlowError extends Error {
  constructor(public readonly code: string) {
    super(`Order flow: ${code}`);
    this.name = "OrderFlowError";
  }
}
