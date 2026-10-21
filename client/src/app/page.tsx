'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../components/layout/header';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { api, Project } from '../lib/api';
import { useAuthStore } from '../store/auth';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Plus,
  Layers,
  Clock,
  Zap,
  LogIn,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileCode2,
  Sparkles,
  Download,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/modal';
import { pageVariants, staggerContainer, staggerItem, EASE_OUT_EXPO } from '../lib/animations';

export default function DashboardPage() {
  const { isAuthenticated, token, setAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: ['projects', token], queryFn: api.projects.list, enabled: !!token,
  });
  const [quickLoginLoading, setQuickLoginLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'processing' | 'failed'>('all');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await api.projects.delete(projectToDelete.id);
      queryClient.setQueryData<Project[]>(['projects', token], (prev) => prev?.filter((p) => p.id !== projectToDelete.id));
      toast.success(`Project "${projectToDelete.name}" deleted successfully`);
      setProjectToDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickDevLogin = async () => {
    setQuickLoginLoading(true);
    try {
      const res = await api.auth.quickLogin();
      setAuth(res.user, res.token);
      toast.success('Signed in as Dev User!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setQuickLoginLoading(false);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const latestJob = project.conversionJobs?.[0];
      const status = latestJob?.status || 'none';

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'ready') return status === 'preview_ready' || status === 'published';
      if (statusFilter === 'processing') return !['preview_ready', 'published', 'failed', 'cancelled', 'none'].includes(status);
      if (statusFilter === 'failed') return status === 'failed';
      return true;
    });
  }, [projects, searchQuery, statusFilter]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = projects.length;
    let ready = 0;
    let processing = 0;
    let failed = 0;

    projects.forEach((p) => {
      const s = p.conversionJobs?.[0]?.status;
      if (s === 'preview_ready' || s === 'published') ready++;
      else if (s === 'failed') failed++;
      else if (s && s !== 'cancelled') processing++;
    });

    const successRate = total > 0 ? Math.round((ready / total) * 100) : 100;
    return { total, ready, processing, failed, successRate };
  }, [projects]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <motion.main
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8"
      >
        {/* Top Header & Quick Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground"
              >
                Conversion Studio
              </motion.h1>
              <Badge variant="info" withDot className="hidden sm:inline-flex">
                Elementor 3.x Engine
              </Badge>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: EASE_OUT_EXPO }}
              className="text-muted-foreground text-sm mt-1"
            >
              Transform visual screenshots into native, production-grade Elementor templates.
            </motion.p>
          </div>
          <Link href="/upload">
            <Button className="flex items-center gap-2 shadow-lg shadow-primary/20" leftIcon={<Plus className="w-4 h-4" />}>
              New Conversion
            </Button>
          </Link>
        </div>

        {/* Stats Overview */}
        {isAuthenticated && projects.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Projects</span>
                <Layers className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{stats.total}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Imported design files</p>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ready to Export</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{stats.ready}</div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.successRate}% Success Rate</p>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">In Progress</span>
                <Sparkles className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{stats.processing}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Active pipeline jobs</p>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed Conversions</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{stats.failed}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Jobs needing attention</p>
            </Card>
          </div>
        )}

        {/* Authentication Notice Banner for Guests */}
        {!isAuthenticated && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          >
            <Card className="border border-primary/30 bg-primary/5 p-5 sm:p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <h3 className="text-base font-semibold text-foreground">Sign In to Save & Publish</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Connect your workspace to store uploaded screenshots, review DIR tokens, and publish to WordPress via MCP.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {process.env.NODE_ENV !== 'production' && (
                  <Button
                    onClick={handleQuickDevLogin}
                    isLoading={quickLoginLoading}
                    size="sm"
                    className="flex items-center gap-2"
                    leftIcon={<Zap className="w-3.5 h-3.5" />}
                  >
                    1-Click Dev Sign-In
                  </Button>
                  )}
                  <Link href="/auth/login">
                    <Button variant="outline" size="sm" className="flex items-center gap-2" leftIcon={<LogIn className="w-3.5 h-3.5" />}>
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Search & Filter Toolbar */}
        {isAuthenticated && projects.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by name..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-foreground text-xs sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({projects.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ready')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'ready'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Ready ({stats.ready})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('processing')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'processing'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                In Progress ({stats.processing})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('failed')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'failed'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Failed ({stats.failed})
              </button>
            </div>
          </div>
        )}

        {/* Content Section */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="h-52 rounded-xl bg-card border border-border animate-pulse shimmer"
              />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          >
            <Card className="border-dashed border-2 border-border text-center py-16 bg-card/60">
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <Layers className="w-7 h-7" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {searchQuery ? 'No matching projects found' : 'No conversion projects yet'}
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto text-xs sm:text-sm">
                    {searchQuery
                      ? `No projects matched "${searchQuery}". Clear your search or filter.`
                      : 'Upload a PNG, JPG, or tall webpage screenshot to begin parsing layout structure and generating Elementor templates.'}
                  </p>
                </div>
                {searchQuery ? (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                    Clear Filter
                  </Button>
                ) : (
                  <Link href="/upload">
                    <Button className="mt-2" leftIcon={<Plus className="w-4 h-4" />}>
                      Start First Conversion
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filteredProjects.map((project) => {
              const latestJob = project.conversionJobs?.[0];
              const isReady = latestJob?.status === 'preview_ready' || latestJob?.status === 'published';
              const isFailed = latestJob?.status === 'failed';
              const isRunning = latestJob && !isReady && !isFailed;

              return (
                <motion.div key={project.id} variants={staggerItem} className="h-full">
                  <Card className="h-full bg-card hover:border-primary/50 transition-all flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md group relative">
                    <div>
                      {/* Header bar of Card */}
                      <div className="p-5 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 group/title">
                            <h3 className="font-semibold text-base text-foreground group-hover/title:text-primary transition-colors truncate">
                              {project.name}
                            </h3>
                          </Link>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {latestJob && (
                              <Badge
                                variant={isReady ? 'success' : isFailed ? 'error' : 'info'}
                                withDot={isRunning}
                              >
                                {latestJob.status}
                              </Badge>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setProjectToDelete(project);
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete project"
                              aria-label={`Delete ${project.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <Link href={`/projects/${project.id}`} className="block">
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed hover:text-foreground/80 transition-colors">
                            {project.description || 'Imported design screenshot ready for layout parsing and template compilation.'}
                          </p>
                        </Link>
                      </div>
                    </div>

                    {/* Footer bar of Card */}
                    <Link href={`/projects/${project.id}`} className="block">
                      <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {new Date(project.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-primary group-hover:translate-x-1 transition-transform">
                          Inspect <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Link>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!projectToDelete}
          onClose={() => !deleting && setProjectToDelete(null)}
          title="Delete Project"
          description="This action cannot be undone. Are you sure you want to proceed?"
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Deleting <strong className="font-semibold text-foreground">&ldquo;{projectToDelete?.name}&rdquo;</strong> will permanently remove all associated conversion jobs, DIR documents, Elementor templates, and extracted assets.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProjectToDelete(null)}
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
      </motion.main>
    </div>
  );
}
