import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  computeSha256,
  computeStreamSha256,
  InMemoryDeduplicationStore,
} from '../modules/storage/hasher.js';

describe('Cryptographic Hashing & Scoped Deduplication', () => {
  it('computes correct standard SHA-256 hash vectors', () => {
    // Empty string SHA-256 vector
    const emptyHash = computeSha256(Buffer.from(''));
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // "hello world" SHA-256 vector
    const helloHash = computeSha256(Buffer.from('hello world'));
    expect(helloHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('computes streaming SHA-256 matching direct buffer calculation', async () => {
    const data = Buffer.from('Testing streaming SHA-256 hashing across multiple chunks in Node stream.');
    const expectedHash = computeSha256(data);

    const stream = Readable.from([
      data.subarray(0, 15),
      data.subarray(15, 35),
      data.subarray(35),
    ]);

    const streamHash = await computeStreamSha256(stream);
    expect(streamHash).toBe(expectedHash);
  });

  it('detects duplicate assets within the same project/tenant scope', async () => {
    const store = new InMemoryDeduplicationStore();
    const sha256 = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    const projectId = 'project_alpha';
    const assetId = 'ast_123456';

    // First lookup: not found
    const initialLookup = await store.findDuplicate(sha256, projectId);
    expect(initialLookup).toBeNull();

    // Store record
    await store.recordAsset(sha256, assetId, projectId);

    // Second lookup: found duplicate
    const secondLookup = await store.findDuplicate(sha256, projectId);
    expect(secondLookup).not.toBeNull();
    expect(secondLookup?.assetId).toBe(assetId);
    expect(secondLookup?.sha256).toBe(sha256);
    expect(secondLookup?.scope).toBe(projectId);
  });

  it('enforces tenant scope isolation (same hash across different projects is isolated)', async () => {
    const store = new InMemoryDeduplicationStore();
    const sha256 = 'a'.repeat(64);
    const tenantA = 'tenant_company_a';
    const tenantB = 'tenant_company_b';

    await store.recordAsset(sha256, 'ast_tenant_a', tenantA);

    // Tenant B searching for the same hash should NOT find Tenant A's asset
    const lookupTenantB = await store.findDuplicate(sha256, tenantB);
    expect(lookupTenantB).toBeNull();

    // Tenant A searching for the hash should find it
    const lookupTenantA = await store.findDuplicate(sha256, tenantA);
    expect(lookupTenantA?.assetId).toBe('ast_tenant_a');
  });

  it('allows removing entries and clearing the deduplication store', async () => {
    const store = new InMemoryDeduplicationStore();
    const sha256 = 'c'.repeat(64);
    const scope = 'temp_proj';

    await store.recordAsset(sha256, 'ast_remove_test', scope);
    expect(await store.findDuplicate(sha256, scope)).not.toBeNull();

    await store.remove(sha256, scope);
    expect(await store.findDuplicate(sha256, scope)).toBeNull();

    await store.recordAsset(sha256, 'ast_clear_test', scope);
    store.clear();
    expect(await store.findDuplicate(sha256, scope)).toBeNull();
  });
});
