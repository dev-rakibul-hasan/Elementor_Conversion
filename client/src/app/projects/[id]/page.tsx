'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '../../../components/layout/header';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { StageProgress } from '../../../components/conversion/stage-progress';
import { DIRInspector } from '../../../components/conversion/dir-inspector';
import { ElementorInspector } from '../../../components/conversion/elementor-inspector';
import { api, API_BASE_URL } from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  Download,
  RefreshCw,
  Send,
  ArrowLeft,
  Eye,
  FileCode2,
  FolderTree,
  Activity,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { Modal } from '../../../components/ui/modal';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { token, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['project', projectId, token],
    queryFn: () => api.projects.get(projectId),
    enabled: !!token,
    refetchInterval: (query) => {
      const status = query.state.data?.conversionJobs?.[0]?.status;
      return status && ['preview_ready', 'failed', 'published', 'cancelled'].includes(status) ? false : 3000;
    },
  });
  const job = project?.conversionJobs?.[0];
  const dirData = job?.dirArtifact as Record<string, unknown> | null;
  const elementorData = job?.elementorArtifact as Record<string, unknown> | null;
  const loading = authLoading || isLoading;
  const [activeTab, setActiveTab] = useState<'status' | 'dir' | 'elementor'>('status');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProject = async () => {
    setDeleting(true);
    try {
      await api.projects.delete(projectId);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted successfully');
      router.push('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
      setDeleting(false);
    }
  };

  const handleRetry = async () => {
    if (!job) return;
    try {
      await api.jobs.retry(job.id);
      toast.success('Conversion job retry queued');
      await refetch();
    } catch {
      toast.error('Failed to retry job');
    }
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <div className="flex-1 max-w-7xl w-full mx-auto p-8 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Loading conversion artifacts...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="min-h-screen bg-background text-foreground"><Header />
      <main className="max-w-7xl mx-auto p-8"><p>{error instanceof Error ? error.message : 'Sign in to view this project.'}</p>
        <Link href="/" className="text-primary">Back to Dashboard</Link></main></div>;
  }

  const isReady = job?.status === 'preview_ready' || job?.status === 'published';
  const isFailed = job?.status === 'failed';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-border">
          <div className="space-y-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {project?.name || 'Untitled Project'}
              </h1>
              {job && (
                <Badge
                  variant={isReady ? 'success' : isFailed ? 'error' : 'info'}
                  withDot={!isReady && !isFailed}
                >
                  {job.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isFailed && (
              <Button variant="outline" size="sm" onClick={handleRetry} className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Retry Conversion
              </Button>
            )}
            {elementorData && isReady && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadJson(elementorData, `${project?.name || 'project'}-elementor-page.json`)}
                  className="flex items-center gap-1.5"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  Export Page JSON
                </Button>
                <Link href={`/projects/${projectId}/publish`}>
                  <Button size="sm" className="flex items-center gap-1.5 shadow-md shadow-primary/20" leftIcon={<Send className="w-3.5 h-3.5" />}>
                    Direct Publish to WordPress
                  </Button>
                </Link>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex border-b border-border space-x-6 text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-4 h-4" /> Pipeline Progress
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dir')}
            disabled={!dirData}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'dir'
                ? 'border-primary text-primary font-semibold'
                : !dirData
                ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderTree className="w-4 h-4" /> DIR Architecture
            {dirData && (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full text-foreground">Ready</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('elementor')}
            disabled={!elementorData}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'elementor'
                ? 'border-primary text-primary font-semibold'
                : !elementorData
                ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="w-4 h-4" /> Elementor Canvas Page Structure
            {elementorData && isReady && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium">
                Page Ready
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Status & Stages */}
        {activeTab === 'status' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Multi-Stage Pipeline Execution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StageProgress
                    overallStatus={job?.status || 'queued'}
                    currentStage={job?.currentStage}
                    currentAttempt={job?.attempts}
                    stages={job?.stages || []}
                    errorMessage={job?.errorMessage}
                    errorDetails={job?.errorDetails}
                    onRetry={handleRetry}
                  />
                </CardContent>
              </Card>

              {job?.errorMessage && (
                <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
                    <div>
                      <h4 className="font-semibold text-foreground">Pipeline Execution Error</h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{job.errorMessage}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Conversion
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" /> Source Design Mockup
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {project?.assets && project.assets.length > 0 ? (
                    <div className="border border-border rounded-lg p-2 bg-secondary/30 text-center">
                      <p className="text-[11px] text-muted-foreground mb-2">Original Upload Asset</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${API_BASE_URL}/storage/${(project.assets.find((asset) => asset.id === job?.sourceAssetId) || project.assets[0]).storagePath}`}
                        alt="Source design"
                        className="max-h-64 mx-auto rounded-md object-contain border border-border shadow-sm"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Source mockup asset registered in repository
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 2: DIR Architecture */}
        {activeTab === 'dir' && dirData && <DIRInspector dirData={dirData} />}

        {/* Tab 3: Elementor Structure */}
        {activeTab === 'elementor' && elementorData && (
          <ElementorInspector elementorData={elementorData} />
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={confirmDelete}
          onClose={() => !deleting && setConfirmDelete(false)}
          title="Delete Project"
          description="This action cannot be undone. Are you sure you want to proceed?"
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Deleting <strong className="font-semibold text-foreground">&ldquo;{project?.name || 'this project'}&rdquo;</strong> will permanently remove all associated conversion jobs, DIR documents, Elementor templates, and extracted assets.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteProject}
                isLoading={deleting}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}
