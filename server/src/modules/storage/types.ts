export interface UploadResult {
  key: string;
  size: number;
  contentHash: string;
  mimeType: string;
}

export interface StorageConfig {
  provider: 'local' | 'b2';
  localPath?: string;
  b2Endpoint?: string;
  b2Region?: string;
  b2Bucket?: string;
  b2KeyId?: string;
  b2Key?: string;
}

export interface StorageAdapter {
  /**
   * Upload a file buffer with the specified key and MIME type.
   */
  upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult>;

  /**
   * Download a file buffer by key.
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file by key.
   */
  delete(key: string): Promise<void>;

  /**
   * Generate a signed URL for reading the file.
   * In local storage, this generates a resolvable path or URL.
   */
  getSignedUrl(key: string, expirySeconds?: number): Promise<string>;

  /**
   * Check if a file exists.
   */
  exists(key: string): Promise<boolean>;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  channels: number;
  space?: string;
  hasAlpha: boolean;
}

export interface ImageValidationResult {
  width: number;
  height: number;
  format: string;
  size: number;
  mimeType: string;
}

export interface ImageTile {
  buffer: Buffer;
  index: number;
  yOffset: number;
  height: number;
  totalTiles: number;
}

export interface AnalysisCopyResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}
