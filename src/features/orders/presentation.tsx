export { ErrorDetails as OrderErrorDetails } from '../../shared/ui/ErrorDetails';

export function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value);
}
