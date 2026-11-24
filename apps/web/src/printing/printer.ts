export interface ReceiptPrinter {
  print(): void;
}
export const browserPrinter: ReceiptPrinter = { print: () => window.print() };
