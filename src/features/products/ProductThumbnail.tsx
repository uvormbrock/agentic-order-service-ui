import { useEffect, useState } from 'react';
import { Center, Image, Loader, Text } from '@mantine/core';
import { ApiRequestError } from '../../shared/api/client';
import { getProductThumbnail } from './api';

export function ProductThumbnail({ id, name, revision = 0, compact = false }: { id: string; name: string; revision?: number; compact?: boolean }) {
  const [url, setUrl] = useState<string>();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setUrl(undefined);
    setState('loading');
    getProductThumbnail(id, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setState('ready');
    }).catch(error => {
      if (controller.signal.aborted) return;
      setState(error instanceof ApiRequestError && error.status === 404 && error.code === 'PRODUCT_IMAGE_NOT_FOUND' ? 'missing' : 'error');
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, revision]);

  return <Center h={compact ? 96 : 170} w={compact ? 96 : undefined} bg="gray.0" style={{ borderRadius: 8, flexShrink: 0 }}>
    {state === 'ready' && url ? <Image src={url} alt={`${name} thumbnail`} h={compact ? 80 : 154} w={compact ? 80 : undefined} fit="contain" onError={() => setState('error')} />
      : state === 'loading' ? <Loader size="sm" aria-label={`Loading image for ${name}`} />
        : <Text c="dimmed" size="sm" ta="center">{state === 'missing' ? 'No image' : 'Image unavailable'}</Text>}
  </Center>;
}
