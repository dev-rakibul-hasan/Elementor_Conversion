import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageAdapter, UploadResult } from './types.js';
import { StorageError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

interface S3ErrorLike {
  name?: string;
  message?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

function isS3Error(err: unknown): err is S3ErrorLike {
  return typeof err === 'object' && err !== null;
}

export interface B2ConfigOptions {
  endpoint?: string;
  region?: string;
  bucket?: string;
  keyId?: string;
  applicationKey?: string;
}

/**
 * Generates an unguessable, scoped storage key for a project asset.
 */
export function generateStorageKey(
  projectId: string,
  filename: string,
  prefix = 'projects'
): string {
  const cleanProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanExt = path.extname(filename).toLowerCase();
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${prefix}/${cleanProjectId}/${timestamp}_${randomSuffix}${cleanExt}`;
}

export class B2StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly region: string;

  constructor(config?: B2ConfigOptions) {
    const endpoint = config?.endpoint !== undefined ? config.endpoint : env.B2_ENDPOINT;
    const region = config?.region !== undefined ? config.region : env.B2_REGION;
    const bucket = config?.bucket !== undefined ? config.bucket : env.B2_BUCKET_NAME;
    const keyId = config?.keyId !== undefined ? config.keyId : env.B2_APPLICATION_KEY_ID;
    const applicationKey = config?.applicationKey !== undefined ? config.applicationKey : env.B2_APPLICATION_KEY;

    if (!endpoint) {
      throw new StorageError('Backblaze B2 configuration error: B2_ENDPOINT is required');
    }
    if (!region) {
      throw new StorageError('Backblaze B2 configuration error: B2_REGION is required');
    }
    if (!bucket) {
      throw new StorageError('Backblaze B2 configuration error: B2_BUCKET_NAME is required');
    }
    if (!keyId) {
      throw new StorageError('Backblaze B2 configuration error: B2_APPLICATION_KEY_ID is required');
    }
    if (!applicationKey) {
      throw new StorageError('Backblaze B2 configuration error: B2_APPLICATION_KEY is required');
    }

    this.endpoint = endpoint;
    this.region = region;
    this.bucket = bucket;

    try {
      this.client = new S3Client({
        endpoint: this.endpoint,
        region: this.region,
        credentials: {
          accessKeyId: keyId,
          secretAccessKey: applicationKey,
        },
        // B2 S3 compatible API endpoint
        forcePathStyle: true,
      });

      logger.info(
        { endpoint: this.endpoint, region: this.region, bucket: this.bucket },
        'Initialized Backblaze B2 storage adapter'
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize B2 S3Client');
      throw new StorageError('Failed to initialize Backblaze B2 storage client', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public generateKey(projectId: string, filename: string, prefix = 'projects'): string {
    return generateStorageKey(projectId, filename, prefix);
  }

  public async upload(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<UploadResult> {
    try {
      const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
        ACL: ObjectCannedACL.private,
        Metadata: {
          'sha256-hash': contentHash,
        },
      });

      await this.client.send(command);

      logger.debug(
        { key, size: buffer.length, contentHash, mimeType, bucket: this.bucket },
        'File successfully uploaded to Backblaze B2'
      );

      return {
        key,
        size: buffer.length,
        contentHash,
        mimeType,
      };
    } catch (error: unknown) {
      logger.error({ err: error, key, bucket: this.bucket }, 'Failed to upload file to B2');
      const s3Err = isS3Error(error) ? error : undefined;
      throw new StorageError(`Failed to upload file '${key}' to Backblaze B2`, {
        code: s3Err?.name,
        statusCode: s3Err?.$metadata?.httpStatusCode,
        message: s3Err?.message,
      });
    }
  }

  public async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new StorageError(`File '${key}' has empty response body in Backblaze B2`);
      }

      const streamCandidate = response.Body as {
        transformToByteArray?: () => Promise<Uint8Array>;
      };

      if (typeof streamCandidate.transformToByteArray === 'function') {
        const byteArray = await streamCandidate.transformToByteArray();
        return Buffer.from(byteArray);
      }

      // Fallback stream consumption
      const chunks: Buffer[] = [];
      const asyncIterable = response.Body as unknown as AsyncIterable<Uint8Array | Buffer>;
      for await (const chunk of asyncIterable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error: unknown) {
      const s3Err = isS3Error(error) ? error : undefined;
      if (s3Err?.name === 'NoSuchKey' || s3Err?.$metadata?.httpStatusCode === 404) {
        throw new StorageError(`File '${key}' not found in Backblaze B2`);
      }
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error({ err: error, key, bucket: this.bucket }, 'Failed to download file from B2');
      throw new StorageError(`Failed to download file '${key}' from Backblaze B2`, {
        code: s3Err?.name,
        statusCode: s3Err?.$metadata?.httpStatusCode,
        message: s3Err?.message,
      });
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      logger.debug({ key, bucket: this.bucket }, 'File successfully deleted from Backblaze B2');
    } catch (error: unknown) {
      logger.error({ err: error, key, bucket: this.bucket }, 'Failed to delete file from B2');
      const s3Err = isS3Error(error) ? error : undefined;
      throw new StorageError(`Failed to delete file '${key}' from Backblaze B2`, {
        code: s3Err?.name,
        statusCode: s3Err?.$metadata?.httpStatusCode,
        message: s3Err?.message,
      });
    }
  }

  public async getSignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: expirySeconds,
      });
    } catch (error: unknown) {
      logger.error({ err: error, key, bucket: this.bucket }, 'Failed to generate B2 signed URL');
      const s3Err = isS3Error(error) ? error : undefined;
      throw new StorageError(`Failed to generate signed URL for '${key}' from Backblaze B2`, {
        code: s3Err?.name,
        statusCode: s3Err?.$metadata?.httpStatusCode,
        message: s3Err?.message,
      });
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      const s3Err = isS3Error(error) ? error : undefined;
      if (
        s3Err?.name === 'NotFound' ||
        s3Err?.name === 'NoSuchKey' ||
        s3Err?.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      logger.error({ err: error, key, bucket: this.bucket }, 'Error checking existence in B2');
      throw new StorageError(`Failed to check existence for '${key}' in Backblaze B2`, {
        code: s3Err?.name,
        statusCode: s3Err?.$metadata?.httpStatusCode,
        message: s3Err?.message,
      });
    }
  }
}
