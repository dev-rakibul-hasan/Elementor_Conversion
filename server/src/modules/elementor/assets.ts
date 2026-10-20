import type {
  ElementorAssetManifest,
  ElementorAssetManifestEntry,
} from '../../contracts/api.js';
import type { DIRAsset, DIRDocument, DIRImageNode } from '../dir/types.js';

export function resolvePublicAssetUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : undefined;
}

function getAttachmentId(asset: DIRAsset): number | undefined {
  const value = asset.metadata?.wordpressAttachmentId;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export function resolveDIRAssetUrl(asset?: DIRAsset): string | undefined {
  if (!asset) return undefined;
  return resolvePublicAssetUrl(asset.url) ?? resolvePublicAssetUrl(asset.placeholder);
}

export function resolveDIRAssetReference(
  assetId: string | undefined,
  document: DIRDocument
): { url?: string; wordpressAttachmentId?: number; storagePath?: string } {
  const asset = assetId
    ? document.assets.find((candidate) => candidate.id === assetId)
    : undefined;
  return {
    url: resolveDIRAssetUrl(asset),
    wordpressAttachmentId: asset ? getAttachmentId(asset) : undefined,
    storagePath: asset?.path,
  };
}

export function resolveImageAsset(
  node: DIRImageNode,
  document: DIRDocument
): { url?: string; wordpressAttachmentId?: number; storagePath?: string } {
  const asset = node.assetId
    ? document.assets.find((candidate) => candidate.id === node.assetId)
    : undefined;

  return {
    url:
      resolvePublicAssetUrl(node.url) ??
      resolveDIRAssetUrl(asset) ??
      resolvePublicAssetUrl(node.path),
    wordpressAttachmentId: asset ? getAttachmentId(asset) : undefined,
    storagePath: asset?.path,
  };
}

export function createElementorAssetManifest(document: DIRDocument): ElementorAssetManifest {
  const assets: ElementorAssetManifestEntry[] = document.assets.map((asset) => {
    const resolvedUrl = resolveDIRAssetUrl(asset);
    const wordpressAttachmentId = getAttachmentId(asset);
    const entry: ElementorAssetManifestEntry = {
      assetId: asset.id,
      type: asset.type,
      role: asset.role,
      status: resolvedUrl
        ? 'ready'
        : asset.path
          ? 'stored'
          : asset.sourceRect
            ? 'pending_crop'
            : 'unresolved',
    };

    if (asset.sourceRect) entry.sourceRect = asset.sourceRect;
    if (asset.path) entry.storagePath = asset.path;
    if (resolvedUrl) entry.resolvedUrl = resolvedUrl;
    if (wordpressAttachmentId) entry.wordpressAttachmentId = wordpressAttachmentId;
    return entry;
  });

  return {
    assets,
    unresolvedAssetIds: assets
      .filter((asset) => !asset.resolvedUrl)
      .map((asset) => asset.assetId),
  };
}
