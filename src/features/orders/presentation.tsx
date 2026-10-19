import { Text } from '@mantine/core';
import { ApiRequestError } from '../../shared/api/client';
export function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value);
}
export function OrderErrorDetails({ error }: { error: Error }) {
  return <><Text size="sm">{error.message}</Text>{error instanceof ApiRequestError && error.code && <Text size="sm">Code: {error.code}</Text>}{error instanceof ApiRequestError && error.requestId && <Text size="sm">Request ID: {error.requestId}</Text>}</>;
}
