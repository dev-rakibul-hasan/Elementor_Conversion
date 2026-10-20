/**
 * Initial Canvas Isolation Service
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Establishes the secure boundary between untrusted uploaded image files
 * and the downstream Elementor conversion pipeline.
 * Guarantees state isolation and valid initial coordinate systems.
 */

import crypto from 'node:crypto';
import type { ValidatedImageMetadata, IsolatedCanvasState, CanvasTransform, StorageConfig } from './types.js';
import type { DIRCanvasBounds } from '../dir/types.js';

export interface CanvasInitializationOptions {
  preferredBackground?: string;
  viewportMaxWidth?: number;
  canvasBounds?: DIRCanvasBounds;
}

export class CanvasIsolationService {
  constructor(public readonly config?: StorageConfig) {}

  public createIsolatedCanvas(
    metadata: ValidatedImageMetadata,
    options: CanvasInitializationOptions = {}
  ): IsolatedCanvasState {
    return CanvasIsolationService.createIsolatedCanvas(metadata, options);
  }

  /**
   * Initializes a safe, independent canvas state bound to the validated image asset.
   */
  public static createIsolatedCanvas(
    metadata: ValidatedImageMetadata,
    options: CanvasInitializationOptions = {}
  ): IsolatedCanvasState {
    const canvasId = `cvs_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const width = metadata.normalizedWidth;
    const height = metadata.normalizedHeight;
    const aspectRatio = metadata.aspectRatio;

    // Default transform: 1:1 scale, zero rotation, origin placement
    const defaultTransform: CanvasTransform = {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    };

    // Calculate display dimensions bounded by optional viewport maxWidth
    let displayWidth = width;
    let displayHeight = height;

    if (options.viewportMaxWidth && width > options.viewportMaxWidth) {
      const scale = options.viewportMaxWidth / width;
      displayWidth = Math.round(width * scale);
      displayHeight = Math.round(height * scale);
    }

    const canvasBounds: DIRCanvasBounds = options.canvasBounds || {
      crop_mockup: false,
      inner_bg_type: 'solid',
      primary_hex: options.preferredBackground || '#050a04',
      x: 0,
      y: 0,
      width,
      height,
    };

    return {
      canvasId,
      sourceAssetId: metadata.id,
      canvasWidth: width,
      canvasHeight: height,
      displayWidth,
      displayHeight,
      transform: defaultTransform,
      aspectRatio,
      canvasBounds,
      status: 'initialized',
      initializedAt: new Date().toISOString(),
      warnings: [],
    };
  }

  /**
   * Clones a canvas state defensively to prevent mutation across stages.
   */
  public static cloneCanvas(canvas: IsolatedCanvasState): IsolatedCanvasState {
    return JSON.parse(JSON.stringify(canvas)) as IsolatedCanvasState;
  }
}
