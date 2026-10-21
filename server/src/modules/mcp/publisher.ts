/** Publish only authenticated remote results; preserve settings and fail on media errors. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { PublishRequest, PublishResult, MCPConnectionConfig } from './types.js';
import { MCPClient } from './client.js';
import { prisma } from '../../lib/prisma.js';
import { createStorageAdapter, getStorage } from '../storage/factory.js';
import { getAuthoritativeElementorVersion } from '../elementor/serializer.js';

// PHP/WordPress may encode an empty settings object as []; object key order is not semantic.
function canonical(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (!Object.keys(value).length) return null;
  return Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function equalContent(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export class MCPPublisher {
  private client: MCPClient;
  constructor(config: MCPConnectionConfig) { this.client = new MCPClient(config); }

  public async publish(req: PublishRequest): Promise<PublishResult> {
    req = { ...req, idempotencyKey: req.idempotencyKey || createHash('sha256').update(JSON.stringify({ site: this.client.getSiteUrl(), title: req.title, mode: req.publishMode, document: canonical(req.elementorJson) })).digest('hex') };
    const start = Date.now();
    let remoteId: string | number | undefined;
    let remoteUrl: string | undefined;
    try {
      const capabilities = await this.client.checkCapabilities();
      if (req.resourceType !== 'page') throw new Error('Template publishing is not supported; export the template JSON instead');
      if (!capabilities.canCreatePage) throw new Error('Connected WordPress site does not support page creation via MCP');
      if (!capabilities.supportsIdempotency) throw new Error('Install the updated Elementor MCP Bridge to enable duplicate-safe publishing');
      const doc = structuredClone(req.elementorJson) as any;
      if (!Array.isArray(doc?.content) || !doc.content.length) throw new Error('Elementor content is empty');
      let elements = doc.content;
      let pageSettings = req.pageSettings || doc.page_settings || {};
      let created: any;
      if (req.idempotencyKey && capabilities.availableTools.some((tool) => tool.name === 'dte_get_publish_result')) {
        const lookup = await this.client.callTool('dte_get_publish_result', { idempotency_key: req.idempotencyKey });
        const prior = lookup.structuredData as any;
        if (prior?.state === 'processing') throw new Error('Publishing is still in progress or requires reconciliation');
        if (prior?.state === 'completed') {
          created = prior.result;
          elements = prior.elements;
          pageSettings = prior.page_settings || {};
          if (!created?.id || !Array.isArray(elements)) throw new Error('Invalid saved publishing receipt');
        }
      }
      if (!created) {
        await this.resolveAndUploadAssets([...elements, { settings: pageSettings }], this.client.getConfig(), req.metadata?.projectId as string | undefined);
        const meta = {
          _elementor_edit_mode: 'builder', _elementor_template_type: 'wp-page',
          _wp_page_template: 'elementor_canvas',
          _elementor_version: req.elementorVersion || doc.elementor_version || getAuthoritativeElementorVersion().elementorVersion,
          _elementor_data: JSON.stringify(elements), _elementor_page_settings: pageSettings,
        };
        const native = capabilities.availableTools.some((tool) => tool.name === 'elementor_create_page');
        const result = await this.client.callTool(native ? 'elementor_create_page' : 'wp_create_post', {
          title: req.title, status: req.publishMode, post_type: 'page', elements,
          page_settings: pageSettings, meta_input: meta, idempotency_key: req.idempotencyKey,
        });
        if (result.isError) throw new Error(result.content?.[0]?.text || 'WordPress page creation failed');
        created = result.structuredData as any;
        // An overlapping retry may finish between lookup and creation.
        if (created?.replayed && Array.isArray(created.elements)) {
          elements = created.elements;
          pageSettings = created.page_settings || {};
        }
      }
      remoteId = created?.id || created?.page_id;
      if (!remoteId) throw new Error('WordPress did not return the created page ID');
      remoteUrl = created.url || created.permalink || created.link || `${this.client.getSiteUrl().replace(/\/$/, '')}/?p=${remoteId}`;
      let verified = false;
      if (capabilities.availableTools.some((tool) => tool.name === 'elementor_get_page_structure')) {
        const read = await this.client.callTool('elementor_get_page_structure', { page_id: Number(remoteId) });
        const saved = read.structuredData as any;
        const savedElements = saved?.elements || saved?.content || saved?.data;
        if (!savedElements || !equalContent(savedElements, elements)) {
          throw new Error('WordPress read-back does not match the submitted Elementor content');
        }
        if (Object.keys(pageSettings).length && !equalContent(saved.page_settings, pageSettings)) {
          throw new Error('WordPress read-back does not match the submitted page settings');
        }
        verified = true;
      }
      return { success: true, remoteId: String(remoteId), remoteUrl, resourceType: req.resourceType,
        status: req.publishMode, verified, durationMs: Date.now() - start, idempotencyKey: req.idempotencyKey };
    } catch (err: any) {
      return { success: false, remoteId, remoteUrl, resourceType: req.resourceType, status: 'failed',
        verified: false, error: err.message, durationMs: Date.now() - start, idempotencyKey: req.idempotencyKey };
    }
  }

  private async resolveAndUploadAssets(elements: any[], config: MCPConnectionConfig, projectId?: string): Promise<void> {
    const uploaded = new Map<string, any>();
    const baseUrl = config.siteUrl.replace(/\/$/, '');
    const visit = async (value: any): Promise<void> => {
      if (!value || typeof value !== 'object') return;
      const candidate = typeof value.url === 'string' ? value.url : '';
      const pathname = /^https?:\/\//.test(candidate) ? new URL(candidate).pathname : '';
      const localUrl = projectId && pathname.startsWith(`/storage/projects/${projectId}/`) ? pathname : candidate;
      if (/^\/?storage\//.test(localUrl)) {
        const raw = value.url as string;
        if (!uploaded.has(raw)) {
          if (this.client.isUsingMock()) throw new Error('Local asset publishing requires a real WordPress connection');
          const key = decodeURIComponent(localUrl.replace(/^\/?storage\//, ''));
          if (key.split(/[\\/]/).includes('..')) throw new Error('Invalid storage asset path');
          if (projectId && !key.startsWith(`projects/${projectId}/`)) throw new Error('Media asset does not belong to this project');
          const stored = projectId ? await prisma.asset.findFirst({ where: { projectId, storagePath: key } }) : null;
          if (projectId && !stored) throw new Error('Media asset is not registered for this project');
          const adapter = stored ? createStorageAdapter({ provider: stored.storageProvider }) : getStorage();
          const buffer = await adapter.download(key);
          const ext = path.extname(key).toLowerCase();
          const mime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' } as Record<string, string>)[ext] || 'image/png';
          const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
            method: 'POST', headers: {
              Authorization: `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.applicationPassword}`).toString('base64')}`,
              'Content-Type': mime, 'Content-Disposition': `attachment; filename="${path.basename(key).replace(/[^a-zA-Z0-9_.-]/g, '_')}"`,
            }, body: new Uint8Array(buffer), signal: AbortSignal.timeout(config.timeoutMs || 30000),
          });
          if (!res.ok) throw new Error(`WordPress media upload failed with HTTP ${res.status}`);
          const data = await res.json() as any;
          if (!data.id || !data.source_url) throw new Error('Invalid WordPress media response');
          uploaded.set(raw, { id: data.id, url: data.source_url });
        }
        Object.assign(value, uploaded.get(raw));
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') await visit(child);
      }
    };
    for (const element of elements) await visit(element);
  }
}
