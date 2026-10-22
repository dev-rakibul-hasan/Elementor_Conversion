'use client';

import React, { useState } from 'react';
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SiteConnection, api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ConnectionStatusProps {
  site: SiteConnection;
  onRefresh?: () => void;
  compact?: boolean;
  className?: string;
}

export function ConnectionStatus({ site, onRefresh, compact = false, className = '' }: ConnectionStatusProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [showTools, setShowTools] = useState(false);

  const isVerified = Boolean(site.lastVerifiedAt || testResult?.ok);
  const hasMcp = Boolean(site.isMcpAvailable);

  const handleTestConnection = async () => {
    setTesting(true);
    const start = Date.now();
    try {
      const res = await api.sites.test(site.id);
      const latencyMs = Date.now() - start;
      setTestResult({ ok: res.ok, message: res.message, latencyMs });
      if (res.ok) {
        toast.success(`Connected to WordPress! (${latencyMs}ms)`);
      } else {
        toast.error(res.message || 'Connection verification failed');
      }
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({ ok: false, message: msg, latencyMs });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const discoveredTools = site.discoveredTools && typeof site.discoveredTools === 'object'
    ? Object.keys(site.discoveredTools)
    : [];

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-3 rounded-lg border border-border bg-card/60 ${className}`}>
        <div className="flex items-center gap-2.5 truncate">
          <Globe className="w-4 h-4 text-primary shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-xs text-foreground block truncate">{site.name || site.siteUrl}</span>
            <span className="text-[10px] text-muted-foreground block truncate">{site.siteUrl}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={isVerified ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
            {isVerified ? 'Online' : 'Unverified'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleTestConnection}
            isLoading={testing}
            title="Test Connection"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className={`border-border bg-card overflow-hidden ${className}`}>
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <span className="truncate max-w-[220px]">{site.name || 'WordPress Site'}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isVerified ? 'success' : 'warning'} className="text-[10px]">
              {isVerified ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Verified Active
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  Unverified
                </span>
              )}
            </Badge>
            {hasMcp && (
              <Badge variant="info" className="text-[10px]">
                <Zap className="w-3 h-3 text-sky-500 mr-1" />
                MCP Publishing Ready
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-xs">
        {/* URL & Hostname */}
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-medium">Target URL:</span>
          <a
            href={site.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-foreground hover:text-primary transition-colors flex items-center gap-1 max-w-[240px] truncate"
          >
            <span className="truncate">{site.siteUrl}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>

        {/* Version Grid */}
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/50 font-mono text-[11px]">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-sans">WordPress</span>
            <span className="text-foreground font-semibold">
              {site.wordpressVersion || (isVerified ? '6.7.x' : 'Pending Verification')}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-sans">Elementor</span>
            <span className="text-foreground font-semibold">
              {site.elementorVersion || (isVerified ? '3.25.x' : 'Pending Verification')}
            </span>
          </div>
        </div>

        {/* Test Result Feedback Banner */}
        {testResult && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
              testResult.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
            )}
            <div className="flex-1 truncate">
              <span className="font-semibold block">{testResult.ok ? 'Connection Verified' : 'Connection Failed'}</span>
              <span className="text-[11px] opacity-90 truncate block">{testResult.message}</span>
              {testResult.latencyMs !== undefined && (
                <span className="text-[10px] font-mono opacity-75">Response Latency: {testResult.latencyMs}ms</span>
              )}
            </div>
          </div>
        )}

        {/* Discovered MCP Capabilities / Tools Dropdown */}
        {discoveredTools.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-primary" />
                Discovered WordPress Tools ({discoveredTools.length})
              </span>
              {showTools ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {showTools && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {discoveredTools.map((tool) => (
                  <Badge key={tool} variant="neutral" className="text-[10px] font-mono">
                    {tool}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
          <span>
            {site.lastVerifiedAt
              ? `Verified ${new Date(site.lastVerifiedAt).toLocaleDateString()}`
              : 'Never verified'}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs flex items-center gap-1.5"
            onClick={handleTestConnection}
            isLoading={testing}
          >
            <RefreshCw className="w-3 h-3" />
            Test Connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

