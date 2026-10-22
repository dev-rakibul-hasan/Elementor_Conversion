'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Header } from '../../../../components/layout/header';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Badge } from '../../../../components/ui/badge';
import { ConnectionStatus } from '../../../../components/sites/connection-status';
import { api, PublishResult } from '../../../../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, CheckCircle2, AlertTriangle, ExternalLink, Globe, Layers, Settings, Zap } from 'lucide-react';

export default function PublishPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: sites = [], refetch: refetchSites } = useQuery({
    queryKey: ['sites'],
    queryFn: api.sites.list,
  });

  const job = project?.conversionJobs?.[0] || null;
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [publishMode, setPublishMode] = useState<'draft' | 'publish'>('draft');
  const [confirmed, setConfirmed] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  const title = customTitle || project?.name || '';
  const effectiveSiteId = selectedSiteId || sites[0]?.id || '';
  const selectedSite = sites.find((s) => s.id === effectiveSiteId) || sites[0];

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) {
      toast.error('No conversion job ready to publish');
      return;
    }
    if (!effectiveSiteId) {
      toast.error('Please configure or select a target WordPress site');
      return;
    }
    if (!confirmed) {
      toast.error('Please check the confirmation box before publishing');
      return;
    }

    setIsPublishing(true);
    try {
      const res = await api.publish.publish({
        projectId,
        jobId: job.id,
        siteConnectionId: effectiveSiteId,
        resourceType: 'page',
        title: title || 'Landing Page',
        mode: publishMode,
        confirmPublish: true,
      });

      if (!res?.success) throw new Error(res?.error || 'Publishing failed');
      if (res) {
        setPublishResult(res);
        toast.success(res.verified ? `Page saved as ${publishMode} and verified` : `Page saved as ${publishMode}; content verification unavailable`);
      } else {
        toast.error('Publishing failed');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Publishing error');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Project
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Publish to WordPress Page
            </h1>
            <Badge variant="success" className="text-xs">
              Elementor Canvas Page
            </Badge>
            <Badge variant="neutral" className="text-xs font-mono">
              Elementor Canvas
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Directly push your compiled design to WordPress <strong>Pages &gt; All Pages</strong> (<code className="text-xs bg-muted px-1.5 py-0.5 rounded">post_type: &apos;page&apos;</code>) with full Elementor Canvas layout.
          </p>
        </div>

        {publishResult ? (
          <Card className="border-emerald-500/40 bg-emerald-500/5 p-6 sm:p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Page saved as {publishResult.status === 'draft' ? 'draft' : 'published'}</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Your design has been compiled into native Elementor Flexbox structures and registered under WordPress <strong>Pages &gt; All Pages</strong>.
            </p>
            <p className="text-xs text-muted-foreground">{publishResult.verified ? 'Saved Elementor content and settings verified.' : 'Saved page; content verification was unavailable.'}</p>
            <div className="bg-card border border-border rounded-xl p-4 max-w-sm mx-auto text-left text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Page ID:</span>
                <span className="text-foreground font-semibold">{publishResult.remoteId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resource Type:</span>
                <span className="text-primary font-semibold">WordPress Page (wp-page)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Page Layout:</span>
                <span className="text-foreground font-semibold">Elementor Canvas</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold uppercase">{publishResult.status}</span>
              </div>
              {publishResult.remoteUrl && (
                <div className="truncate pt-1 border-t border-border">
                  <span className="text-muted-foreground">URL: </span>
                  <a href={publishResult.remoteUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {publishResult.remoteUrl}
                  </a>
                </div>
              )}
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <Button onClick={() => router.push(`/projects/${projectId}`)} variant="outline">
                Return to Project
              </Button>
              {publishResult.remoteUrl && (
                <a href={publishResult.remoteUrl} target="_blank" rel="noreferrer">
                  <Button className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> View Live Page
                  </Button>
                </a>
              )}
            </div>
          </Card>
        ) : (
          <form onSubmit={handlePublish} className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" /> Target WordPress Site
                  </CardTitle>
                  <Link
                    href="/settings"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" /> Manage Sites
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sites.length === 0 ? (
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">No WordPress connections found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Please go to{' '}
                        <Link href="/settings" className="underline font-semibold text-primary">
                          Settings
                        </Link>{' '}
                        to connect your Elementor target site using WordPress Application Passwords.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                        Select Target WordPress Destination
                      </label>
                      <select
                        className="w-full bg-card border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                      >
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name || s.siteUrl} ({s.siteUrl})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Live Connection Status & Verification Card */}
                    {selectedSite && (
                      <ConnectionStatus
                        site={selectedSite}
                        onRefresh={() => { refetchSites(); }}
                      />
                    )}
                  </div>
                )}

                <Input
                  label="Target Page Title"
                  value={title}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Landing Page V1"
                  required
                />

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    Publication Status Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => setPublishMode('draft')}
                      className={`border rounded-xl p-4 cursor-pointer transition-all ${
                        publishMode === 'draft'
                          ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-secondary/60'
                      }`}
                    >
                      <div className="font-semibold text-sm text-foreground">Save as Draft (Recommended)</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Inspect in Elementor visual canvas before publishing live to audience.
                      </p>
                    </div>
                    <div
                      onClick={() => setPublishMode('publish')}
                      className={`border rounded-xl p-4 cursor-pointer transition-all ${
                        publishMode === 'publish'
                          ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-secondary/60'
                      }`}
                    >
                      <div className="font-semibold text-sm text-foreground">Publish Live Immediately</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Instantly makes page publicly accessible at permalink.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-muted-foreground">
                      I confirm publishing to WordPress <code className="text-xs bg-muted px-1 py-0.5 rounded">post_type: &apos;page&apos;</code> with <strong>Elementor Canvas</strong> page template layout.
                    </span>
                  </label>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}`)}
                  disabled={isPublishing}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isPublishing}
                  disabled={isPublishing || sites.length === 0 || !confirmed}
                  leftIcon={<Send className="w-4 h-4" />}
                >
                  {isPublishing ? 'Publishing to WordPress...' : `Publish to WordPress (${publishMode})`}
                </Button>
              </CardFooter>
            </Card>
          </form>
        )}
      </main>
    </div>
  );
}
