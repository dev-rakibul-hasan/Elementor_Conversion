'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Header } from '../../components/layout/header';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { useTheme } from '../../components/theme-provider';
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
  const [sites, setSites] = useState<SiteConnection[]>([]);
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchSites = async () => {
    try {
      const res = await api.sites.list();
      if (res) setSites(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
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
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await api.sites.test(id);
      if (res && res.isMcpAvailable) {
        toast.success('Connection verified! MCP capabilities discovered.');
      } else {
        toast.error(res?.message || 'Connection test failed');
      }
      fetchSites();
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <motion.main
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8"
      >
        <motion.div variants={staggerItem}>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            System & Workspace Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure appearance, target WordPress endpoints, and inspect conversion engine parameters.
          </p>
        </motion.div>

        {/* Appearance & Theme Preferences */}
        <motion.div variants={staggerItem}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Sun className="w-5 h-5 text-primary" /> Appearance & Theme Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Customize your visual interface. Themes switch smoothly without flash or page reloads.
              </p>
              <div className="grid grid-cols-3 gap-3">
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
                  <span className="text-[10px] text-muted-foreground">Crisp clean UI</span>
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
                <Zap className="w-5 h-5 text-amber-500" /> AI Provider & Conversion Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Vision Model</div>
                  <div className="font-semibold text-foreground text-sm mt-1">Gemini 2.5 / Flash</div>
                  <Badge variant="info" className="mt-2 text-[10px]">Stage A & B (DIR Parser)</Badge>
                </div>
                <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Structure Engine</div>
                  <div className="font-semibold text-foreground text-sm mt-1">Groq / Llama 3.3 70B</div>
                  <Badge variant="info" className="mt-2 text-[10px]">Stage C (Elementor AST)</Badge>
                </div>
                <div className="border border-border rounded-xl p-3.5 bg-secondary/30 transition-colors">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Review & Fallback</div>
                  <div className="font-semibold text-foreground text-sm mt-1">OpenRouter / Auto</div>
                  <Badge variant="info" className="mt-2 text-[10px]">Stage D (Validation Gate)</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Deterministic hash caching active: identical screenshots with matching prompt hashes return instant responses with zero API latency.
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
                <div className="space-y-3">
                  {sites.map((site) => (
                    <div
                      key={site.id}
                      className="border border-border rounded-xl p-4 bg-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          {site.name || 'Unnamed Site'}
                          {site.isMcpAvailable && (
                            <Badge variant="success" className="text-[10px]">MCP Active</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{site.siteUrl}</div>
                        {site.wordpressVersion && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            WordPress {site.wordpressVersion} • Elementor {site.elementorVersion || 'Core'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestConnection(site.id)}
                          disabled={testingId === site.id}
                        >
                          {testingId === site.id ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Connection Form */}
              <form onSubmit={handleAddSite} className="border border-border rounded-xl p-4 sm:p-5 bg-card space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Connect New WordPress Site</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Site Label (Optional)"
                    placeholder="e.g. My First WP"
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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Username"
                    placeholder="admin"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                  />
                  <Input
                    label="Application Password"
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Credentials are encrypted using AES-256-GCM before storage and never returned in plaintext.
                </p>
                <Button type="submit" size="sm" className="flex items-center gap-1.5" leftIcon={<Plus className="w-4 h-4" />}>
                  Save WordPress Connection
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.main>
    </div>
  );
}
