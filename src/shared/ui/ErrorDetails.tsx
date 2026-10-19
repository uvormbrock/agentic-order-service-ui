import { Text } from '@mantine/core';
import { ApiRequestError } from '../api/client';

export function ErrorDetails({ error }: { error: Error }) {
  return (
    <>
      <Text size="sm">{error.message}</Text>
      {error instanceof ApiRequestError && error.code && (
        <Text size="sm">Code: {error.code}</Text>
      )}
      {error instanceof ApiRequestError && error.requestId && (
        <Text size="sm">Request ID: {error.requestId}</Text>
      )}
    </>
  );
}
