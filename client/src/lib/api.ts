import axios, { AxiosInstance, AxiosProgressEvent } from 'axios';
import { User, useAuthStore } from '../store/auth';
import { readStorage } from './browser-storage';

export const RAW_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const API_BASE_URL = RAW_API_URL.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = useAuthStore.getState().token || readStorage('dte_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token expiry / error formatting
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        useAuthStore.getState().logout();
      }
    }
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type JobStatus =
  | 'queued'
  | 'validating_upload'
  | 'analyzing_image'
  | 'dir_ready'
  | 'generating_elementor'
  | 'validating_elementor'
  | 'preview_ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export type StageName =
  | 'upload_validation'
  | 'image_analysis'
  | 'dir_generation'
  | 'dir_validation'
  | 'elementor_generation'
  | 'elementor_validation'
  | 'preview_rendering'
  | 'publishing';

export type StageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface JobStage {
  id: string;
  jobId: string;
  stage: StageName;
  status: StageStatus;
  attempt: number;
  inputPayload?: unknown;
  outputPayload?: unknown;
  errorMessage?: string | null;
  durationMs?: number | null;
  tokensUsed?: number | null;
  providerName?: string | null;
  modelName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionJob {
  id: string;
  projectId: string;
  status: JobStatus;
  currentStage?: StageName | null;
  attempts: number;
  maxAttempts: number;
  sourceAssetId?: string | null;
  dirArtifact?: unknown;
  elementorArtifact?: unknown;
  previewArtifact?: unknown;
  errorMessage?: string | null;
  errorDetails?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionJobWithStages extends ConversionJob {
  stages?: JobStage[];
}

export interface Asset {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | string;
  storagePath: string;
  storageProvider: 'local' | 'b2';
  sha256: string;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  sourceImageId?: string | null;
  createdAt: string;
  updatedAt: string;
  assets?: Asset[];
  conversionJobs?: ConversionJobWithStages[];
}

export interface SiteConnection {
  id: string;
  userId: string;
  siteUrl: string;
  name?: string | null;
  elementorVersion?: string | null;
  wordpressVersion?: string | null;
  isMcpAvailable: boolean;
  discoveredTools?: Record<string, unknown> | null;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  cacheHits: number;
  providerBreakdown: Array<{
    provider: string;
    model: string;
    calls: number;
    tokens: number;
    cacheHits: number;
    averageLatencyMs: number;
  }>;
  recentActivity: Array<{
    id: string;
    stage: string;
    provider: string;
    model: string;
    tokens: number;
    durationMs: number;
    status: string;
    timestamp: string;
  }>;
}

export interface PublishPayload {
  projectId: string;
  jobId?: string;
  siteConnectionId: string;
  resourceType: 'page' | 'template';
  title: string;
  mode: 'draft' | 'publish';
  confirmPublish: true;
}

export interface PublishResult {
  success: boolean;
  error?: string;
  remoteId?: string | number;
  remoteUrl?: string;
  status: 'draft' | 'publish' | 'failed' | 'pending';
  verified?: boolean;
  message?: string;
}

export interface SiteCapabilities {
  wordpressVersion?: string;
  elementorVersion?: string;
  supportsIdempotency?: boolean;
  canCreatePage: boolean;
  canUpdatePage: boolean;
  canPublishPage: boolean;
  canCreateTemplate: boolean;
  canUploadMedia: boolean;
  availableTools: Array<{ name: string; description: string }>;
}

// ─────────────────────────────────────────────────────────────
// Typed API Endpoints
// ─────────────────────────────────────────────────────────────

export const api = {
  // Authentication
  auth: {
    login: async (credentials: { email: string; password: string }): Promise<{ token: string; user: User }> => {
      const res = await apiClient.post<ApiResponse<{ token: string; user: User }>>('/auth/login', credentials);
      return res.data.data;
    },
    register: async (data: { email: string; password: string; name?: string }): Promise<{ token: string; user: User }> => {
      const res = await apiClient.post<ApiResponse<{ token: string; user: User }>>('/auth/register', data);
      return res.data.data;
    },
    me: async (): Promise<User> => {
      const res = await apiClient.get<ApiResponse<User>>('/auth/me');
      return res.data.data;
    },
    quickLogin: async (): Promise<{ token: string; user: User }> => {
      const res = await apiClient.post<ApiResponse<{ token: string; user: User }>>('/auth/dev-login');
      return res.data.data;
    },
  },

  // Projects
  projects: {
    list: async (): Promise<Project[]> => {
      const res = await apiClient.get<ApiResponse<Project[]>>('/projects');
      return res.data.data;
    },
    get: async (id: string): Promise<Project> => {
      const res = await apiClient.get<ApiResponse<Project>>(`/projects/${id}`);
      return res.data.data;
    },
    create: async (data: { name: string; description?: string }): Promise<Project> => {
      const res = await apiClient.post<ApiResponse<Project>>('/projects', data);
      return res.data.data;
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const res = await apiClient.delete<ApiResponse<{ success: boolean }>>(`/projects/${id}`);
      return res.data.data;
    },
  },

  // File Upload
  upload: {
    uploadImage: async (
      file: File,
      projectName?: string,
      onProgress?: (progressPercent: number) => void,
      description?: string
    ): Promise<{ project: Project; job: ConversionJobWithStages; asset: Asset }> => {
      const formData = new FormData();
      formData.append('image', file);
      if (description?.trim()) formData.append('description', description.trim());
      if (projectName) {
        formData.append('name', projectName);
      }

      const res = await apiClient.post<ApiResponse<{ project: Project; job: ConversionJobWithStages; asset: Asset }>>(
        '/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total && onProgress) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(percentCompleted);
            }
          },
        }
      );
      return res.data.data;
    },
  },

  // Conversion Jobs
  jobs: {
    getJob: async (jobId: string): Promise<ConversionJobWithStages> => {
      const res = await apiClient.get<ApiResponse<ConversionJobWithStages>>(`/jobs/${jobId}`);
      return res.data.data;
    },
    getLatestForProject: async (projectId: string): Promise<ConversionJobWithStages | null> => {
      const res = await apiClient.get<ApiResponse<ConversionJobWithStages | null>>(`/projects/${projectId}/job`);
      return res.data.data;
    },
    getDir: async (jobId: string): Promise<Record<string, unknown> | null> => {
      const res = await apiClient.get<ApiResponse<Record<string, unknown>>>(`/jobs/${jobId}/dir`);
      return res.data.data;
    },
    getElementor: async (jobId: string): Promise<Record<string, unknown> | null> => {
      const res = await apiClient.get<ApiResponse<Record<string, unknown>>>(`/jobs/${jobId}/elementor`);
      return res.data.data;
    },
    getArtifacts: async (jobId: string): Promise<{ dir: unknown; elementor: unknown; preview: unknown }> => {
      const res = await apiClient.get<ApiResponse<{ dir: unknown; elementor: unknown; preview: unknown }>>(
        `/jobs/${jobId}/artifacts`
      );
      return res.data.data;
    },
    retry: async (jobId: string): Promise<ConversionJobWithStages> => {
      const res = await apiClient.post<ApiResponse<ConversionJobWithStages>>(`/jobs/${jobId}/retry`, {});
      return res.data.data;
    },
    cancel: async (jobId: string): Promise<ConversionJobWithStages> => {
      const res = await apiClient.post<ApiResponse<ConversionJobWithStages>>(`/jobs/${jobId}/cancel`);
      return res.data.data;
    },
  },

  // Site Connections
  sites: {
    list: async (): Promise<SiteConnection[]> => {
      const res = await apiClient.get<ApiResponse<SiteConnection[]>>('/sites');
      return res.data.data;
    },
    create: async (data: {
      siteUrl: string;
      name?: string;
      username?: string;
      applicationPassword?: string;
      credentials?: {
        applicationPassword?: string;
        username?: string;
        apiKey?: string;
      };
    }): Promise<SiteConnection> => {
      const payload = {
        name: data.name,
        siteUrl: data.siteUrl,
        username: data.username || data.credentials?.username,
        applicationPassword: data.applicationPassword || data.credentials?.applicationPassword,
        credentials: data.credentials,
      };
      const res = await apiClient.post<ApiResponse<SiteConnection>>('/sites', payload);
      return res.data.data;
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const res = await apiClient.delete<ApiResponse<{ success: boolean }>>(`/sites/${id}`);
      return res.data.data;
    },
    test: async (id: string): Promise<{ ok: boolean; message: string }> => {
      const res = await apiClient.post<ApiResponse<{ ok: boolean; message: string }>>(`/sites/${id}/test`);
      return res.data.data;
    },
    capabilities: async (id: string): Promise<SiteCapabilities> => {
      const res = await apiClient.get<ApiResponse<SiteCapabilities>>(`/sites/${id}/capabilities`);
      return res.data.data;
    },
  },

  // Publishing
  publish: {
    publish: async (payload: PublishPayload): Promise<PublishResult> => {
      const res = await apiClient.post<ApiResponse<PublishResult>>('/publish', payload);
      return res.data.data;
    },
  },

};
