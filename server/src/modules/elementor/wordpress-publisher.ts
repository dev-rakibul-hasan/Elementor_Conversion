import type {
  NativeElementorTemplate,
  PublishJobRequest,
  PublishJobResponse,
} from '../../contracts/api.js';
import type { IWordPressPublisher } from '../orchestration/adapters.js';
import { validateElementorTemplate } from './validator.js';

export interface WordPressRESTCredentials {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  siteConnectionId?: string;
}

interface WordPressPageResponse {
  id: number | string;
  status: string;
  link?: string;
  _links?: { edit?: Array<{ href?: string }> };
  meta?: Record<string, unknown>;
  message?: string;
  code?: string;
}

function isWordPressPageResponse(value: unknown): value is WordPressPageResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (typeof record.id === 'number' || typeof record.id === 'string') &&
    typeof record.status === 'string'
  );
}

function validateSiteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WordPress baseUrl must be a valid absolute URL');
  }

  const isLocalhost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('WordPress baseUrl must use HTTPS (HTTP is allowed only for localhost) and contain no credentials or query');
  }

  return url;
}

export class WordPressRESTPublisher implements IWordPressPublisher {
  private readonly baseUrl: string;
  private readonly siteConnectionId: string;
  private readonly authorization: string;
  private readonly fetcher: typeof fetch;

  constructor(credentials: WordPressRESTCredentials, fetcher: typeof fetch = fetch) {
    const url = validateSiteUrl(credentials.baseUrl);
    if (!credentials.username || !credentials.applicationPassword) {
      throw new Error('WordPress username and application password are required');
    }
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.siteConnectionId = credentials.siteConnectionId || url.origin;
    this.authorization = `Basic ${Buffer.from(
      `${credentials.username}:${credentials.applicationPassword}`
    ).toString('base64')}`;
    this.fetcher = fetcher;
  }

  public async publishTemplate(
    jobId: string,
    template: NativeElementorTemplate,
    options: Pick<PublishJobRequest, 'postTitle' | 'postStatus'> = {},
    signal?: AbortSignal
  ): Promise<PublishJobResponse> {
    const validation = validateElementorTemplate(template);
    if (!validation.valid) {
      throw new Error(`Refusing to publish invalid Elementor template: ${validation.errors.join('; ')}`);
    }

    const postStatus = options.postStatus ?? 'draft';
    const postTitle = options.postTitle?.trim() || template.title;
    const response = await this.fetcher(`${this.baseUrl}/wp-json/wp/v2/pages`, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: postTitle,
        status: postStatus,
        content: '',
        template: 'elementor_canvas',
        meta: {
          _elementor_data: JSON.stringify(template.content),
          _elementor_edit_mode: 'builder',
          _elementor_template_type: 'wp-page',
        },
      }),
      signal,
    });

    const bodyText = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new Error(
        `WordPress REST API returned a non-JSON response (HTTP ${response.status})`
      );
    }

    if (!response.ok) {
      const record =
        typeof body === 'object' && body !== null && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : undefined;
      const detail =
        (typeof record?.message === 'string' && record.message) ||
        (typeof record?.code === 'string' && record.code) ||
        response.statusText;
      throw new Error(`WordPress page creation failed (HTTP ${response.status}): ${detail}`);
    }
    if (!isWordPressPageResponse(body)) {
      throw new Error('WordPress REST API returned an invalid page response');
    }
    if (body.status !== postStatus) {
      throw new Error('WordPress REST API response is missing the created page id or requested status');
    }
    if (
      typeof body.meta?._elementor_data !== 'string' ||
      body.meta._elementor_data !== JSON.stringify(template.content) ||
      body.meta._elementor_edit_mode !== 'builder'
    ) {
      throw new Error(
        'WordPress created the page but did not confirm Elementor data; expose writable Elementor meta in the REST API'
      );
    }

    const result: PublishJobResponse = {
      jobId,
      siteConnectionId: this.siteConnectionId,
      wordpressPostId: body.id,
      postStatus,
      publishedAt: new Date().toISOString(),
    };
    if (body.link) result.previewUrl = body.link;
    const editUrl = body._links?.edit?.[0]?.href;
    if (editUrl) result.editUrl = editUrl;
    return result;
  }
}
