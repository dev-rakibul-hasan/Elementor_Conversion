'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Header } from '../../components/layout/header';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { useTheme } from '../../components/theme-provider';
import { ConnectionStatus } from '../../components/sites/connection-status';
import { api, SiteConnection } from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Moon,
  Sun,
  Laptop,
  ArrowLeft,
  Server,
  Layers,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../lib/animations';

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const { data: sites = [], refetch: fetchSites } = useQuery({
    queryKey: ['sites', token],
    queryFn: api.sites.list,
    enabled: !!token,
  });
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.sites.create({
        name: newSiteName.trim() || undefined,
        siteUrl: newSiteUrl.trim(),
        username: newUsername.trim(),
        applicationPassword: newPassword.trim(),
        credentials: {
          username: newUsername.trim(),
          applicationPassword: newPassword.trim(),
        },
      });
      toast.success('WordPress connection saved with encrypted credentials');
      setNewSiteName('');
      setNewSiteUrl('');
      setNewUsername('');
      setNewPassword('');
      fetchSites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to register site connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSite = async (id: string) => {
    try {
      await api.sites.delete(id);
      queryClient.setQueryData<SiteConnection[]>(['sites', token], (current) => current?.filter((site) => site.id !== id));
      toast.success('WordPress connection deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete connection');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Settings &amp; Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your connected WordPress destinations, Elementor MCP publishing rules, and preferences.
          </p>
        </div>

        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
          {/* Theme Settings */}
          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sun className="w-5 h-5 text-primary" /> Appearance &amp; Color Theme
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                      theme === 'light'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-secondary/60'
                    }`}
                  >
                    <Sun className={`w-5 h-5 ${theme === 'light' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold text-foreground">Light Mode</span>
                    <span className="text-[10px] text-muted-foreground">Crisp high contrast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                      theme === 'dark'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-secondary/60'
                    }`}
                  >
                    <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-indigo-400' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold text-foreground">Dark Mode</span>
                    <span className="text-[10px] text-muted-foreground">Deep obsidian slate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                      theme === 'system'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-secondary/60'
                    }`}
                  >
                    <Laptop className={`w-5 h-5 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold text-foreground">System</span>
                    <span className="text-[10px] text-muted-foreground">Sync with OS</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* AI Provider Architecture Overview */}
          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" /> AI Provider &amp; Conversion Architecture
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Vision Model</div>
                    <div className="font-semibold text-foreground text-sm mt-1">Google Gemini Flash-Lite</div>
                    <Badge variant="info" className="mt-2 text-[10px]">Multimodal Vision (1.1s)</Badge>
                  </div>
                  <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Structure Engine</div>
                    <div className="font-semibold text-foreground text-sm mt-1">Deterministic DIR compiler</div>
                    <Badge variant="info" className="mt-2 text-[10px]">Elementor AST</Badge>
                  </div>
                  <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Review &amp; Fallback</div>
                    <div className="font-semibold text-foreground text-sm mt-1">OpenRouter Claude-3.5</div>
                    <Badge variant="info" className="mt-2 text-[10px]">Self-Healing Gate</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Matching image, input, model and prompt versions reuse cached AI responses. Elementor compilation and content checks run locally.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* WordPress MCP Site Connections */}
          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" /> Connected WordPress Destinations (MCP)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {sites.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Active WordPress Destinations ({sites.length})
                    </h4>
                    {sites.map((site) => (
                      <div key={site.id} className="relative group">
                        <ConnectionStatus site={site} onRefresh={fetchSites} />
                        <div className="absolute top-3.5 right-12 flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${site.name || site.siteUrl}`}
                            onClick={() => handleDeleteSite(site.id)}
                            title="Delete Connection"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Connection Form */}
                <form onSubmit={handleAddSite} className="border border-border rounded-xl p-4 sm:p-5 bg-card space-y-4">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" /> Connect New WordPress Site
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Site Label (Optional)"
                      placeholder="e.g. Production Blog / Portfolio"
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                    />
                    <Input
                      label="WordPress Site URL"
                      placeholder="https://mysite.com"
                      value={newSiteUrl}
                      onChange={(e) => setNewSiteUrl(e.target.value)}
                      required
                    />
                    <Input
                      label="WordPress Username"
                      placeholder="admin"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                    />
                    <Input
                      label="Application Password"
                      type="password"
                      placeholder="abcd efgh ijkl mnop"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Credentials encrypted with AES-256-GCM before storage
                    </div>
                    <Button type="submit" isLoading={saving} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                      Save Connection
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
