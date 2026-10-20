import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Download,
  Check,
  Code,
  FolderTree,
  Palette,
  Type,
  Box,
  Image as ImageIcon,
  ExternalLink,
  MousePointer,
  Hash,
  Sparkles,
  Smartphone,
  Tablet,
  Monitor,
  Search,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';

interface DIRInspectorProps {
  dirData: Record<string, unknown> | null;
  className?: string;
}

function countTotalNodes(nodes: Array<Record<string, unknown>>): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    const children = (node.children || node.elements || node.nodes || []) as Array<Record<string, unknown>>;
    if (children.length > 0) {
      count += countTotalNodes(children);
    }
  }
  return count;
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').trim();
}

export function DIRInspector({ dirData, className }: DIRInspectorProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
  const [isMinified, setIsMinified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewportFilter, setViewportFilter] = useState<'all' | 'desktop' | 'tablet' | 'mobile'>('all');

  const rawJson = useMemo(() => JSON.stringify(dirData || {}), [dirData]);
  const formattedJson = useMemo(() => JSON.stringify(dirData || {}, null, 2), [dirData]);
  const activeJson = isMinified ? rawJson : formattedJson;

  if (!dirData) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
        <FolderTree className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        No DIR JSON artifact available yet for this project.
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeJson);
      setCopied(true);
      toast.success('DIR JSON copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyColor = async (name: string, hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      toast.success(`Copied ${hex} (${name})!`);
      setTimeout(() => setCopiedHex(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dir-export-${isMinified ? 'min-' : ''}${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleNode = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    const collectKeys = (nodes: Array<Record<string, unknown>>, parentKey: string) => {
      nodes.forEach((n, idx) => {
        const key = `${parentKey}-node-${n.id || idx}`;
        next[key] = collapse;
        const children = (n.children || n.elements || n.nodes || []) as Array<Record<string, unknown>>;
        if (children.length > 0) collectKeys(children, key);
      });
    };
    pages.forEach((p, pIdx) => {
      const pKey = `page-${pIdx}`;
      next[pKey] = collapse;
      const sections = (p.sections as Array<Record<string, unknown>>) || [];
      sections.forEach((s, sIdx) => {
        const sKey = `${pKey}-sec-${sIdx}`;
        next[sKey] = collapse;
        const sChildren = (s.children || s.nodes || s.elements || []) as Array<Record<string, unknown>>;
        collectKeys(sChildren, sKey);
      });
    });
    setCollapsedNodes(next);
  };

  // Extract high-level DIR metadata
  const meta = (dirData.meta as Record<string, unknown>) || {};
  const globals = (dirData.globals as Record<string, unknown>) || {};
  const colors = (globals.colors as Record<string, string>) || {};
  const pages = (dirData.pages as Array<Record<string, unknown>>) || [];
  const confidence = typeof meta.confidenceScore === 'number' ? meta.confidenceScore : 0.95;

  const matchesSearch = (node: Record<string, unknown>): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const kind = String(node.kind || node.type || '').toLowerCase();
    const text = String(node.text || node.heading || node.alt || '').toLowerCase();
    const id = String(node.id || '').toLowerCase();

    if (kind.includes(q) || text.includes(q) || id.includes(q)) return true;

    const children = (node.children || node.elements || node.nodes || []) as Array<Record<string, unknown>>;
    return children.some((c) => matchesSearch(c));
  };

  const renderNodeTree = (nodes: Array<Record<string, unknown>>, parentKey: string, depth = 0) => {
    return nodes
      .filter((node) => matchesSearch(node))
      .map((node, nodeIdx) => {
        const nodeKey = `${parentKey}-node-${node.id || nodeIdx}`;
        const isNodeCollapsed = Boolean(collapsedNodes[nodeKey]);
        const children = (node.children || node.elements || node.nodes || []) as Array<Record<string, unknown>>;
        const hasChildren = children.length > 0;
        const kind = String(node.kind || node.type || 'element');
        const text = String(node.text || node.heading || node.alt || (node.html ? stripHtml(String(node.html)) : '') || '');
        const responsiveOverrides = node.responsiveOverrides as Record<string, unknown> | undefined;
        const hasResponsive = Boolean(responsiveOverrides && Object.keys(responsiveOverrides).length > 0);

        // Icon determination
        let icon = <Box className="h-3.5 w-3.5 text-cyan-500 shrink-0" />;
        if (kind === 'image') icon = <ImageIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
        else if (kind === 'heading') icon = <Type className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
        else if (kind === 'text') icon = <Code className="h-3.5 w-3.5 text-slate-500 shrink-0" />;
        else if (kind === 'button') icon = <MousePointer className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
        else if (kind === 'link') icon = <ExternalLink className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
        else if (kind === 'counter') icon = <Hash className="h-3.5 w-3.5 text-purple-500 shrink-0" />;
        else if (kind === 'badge') icon = <Sparkles className="h-3.5 w-3.5 text-lime-500 shrink-0" />;

        if (hasChildren) {
          const nestedCount = countTotalNodes(children);
          return (
            <div key={nodeKey} className="rounded-lg border border-border bg-card my-1 overflow-hidden">
              <div
                onClick={() => toggleNode(nodeKey)}
                className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-xs hover:bg-secondary/60 select-none transition-colors"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  {isNodeCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-mono text-[11px] font-semibold text-primary">{kind}</span>
                  {Boolean(node.direction) && (
                    <span className="text-[10px] text-muted-foreground font-mono">[{String(node.direction)}]</span>
                  )}
                  {Boolean(node.columns) && (
                    <span className="text-[10px] text-muted-foreground font-mono">[{String(node.columns)} cols]</span>
                  )}
                  {hasResponsive && (
                    <span className="flex items-center gap-0.5 text-[9px] bg-primary/10 text-primary border border-primary/20 px-1 rounded font-mono">
                      <Smartphone className="h-2.5 w-2.5" />
                      resp
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {nestedCount} node{nestedCount === 1 ? '' : 's'}
                  </span>
                  {node.confidence !== undefined && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      {Math.round(Number(node.confidence) * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {!isNodeCollapsed && (
                <div className="pl-4 pr-1.5 py-1 border-l-2 border-border/70 ml-2 space-y-1">
                  {renderNodeTree(children, nodeKey, depth + 1)}
                </div>
              )}
            </div>
          );
        }

        // Leaf Node
        return (
          <div
            key={nodeKey}
            className="flex items-center justify-between py-1 px-2 rounded hover:bg-secondary/40 text-xs transition-colors"
          >
            <div className="flex items-center gap-2 truncate pr-2">
              {icon}
              <span className="font-mono text-[11px] text-foreground font-medium">{kind}</span>
              {Boolean(node.level) && (
                <span className="text-[10px] font-mono text-amber-500 font-bold">H{String(node.level)}</span>
              )}
              {Boolean(text) && (
                <span className="truncate text-[11px] text-muted-foreground italic">&quot;{text}&quot;</span>
              )}
              {kind === 'counter' && node.value !== undefined && (
                <span className="text-[11px] font-mono font-bold text-purple-500">
                  {String(node.prefix || '')}{String(node.value)}{String(node.suffix || '')}
                </span>
              )}
              {Boolean(node.assetId) && (
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1 rounded truncate">
                  {String(node.assetId)}
                </span>
              )}
              {hasResponsive && (
                <span className="flex items-center gap-0.5 text-[9px] bg-primary/10 text-primary border border-primary/20 px-1 rounded font-mono shrink-0">
                  <Smartphone className="h-2.5 w-2.5" />
                  resp
                </span>
              )}
            </div>
            {node.confidence !== undefined && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
                {Math.round(Number(node.confidence) * 100)}%
              </span>
            )}
          </div>
        );
      });
  };

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm ${className || ''}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
            <FolderTree className="h-4 w-4 text-primary" />
            <span>Design Intermediate Representation (DIR)</span>
          </div>
          <Badge variant="success" withDot>
            {Math.round(confidence * 100)}% Vision Score
          </Badge>
          {meta.analysisModel ? (
            <span className="hidden sm:inline-block text-xs font-mono text-muted-foreground">
              {String(meta.analysisModel)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode switch */}
          <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Tree
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewMode === 'raw' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              JSON
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={handleCopy} leftIcon={copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} leftIcon={<Download className="h-3.5 w-3.5" />}>
            Download DIR
          </Button>
        </div>
      </div>

      {/* Body */}
      {viewMode === 'raw' ? (
        <div className="max-h-[600px] overflow-auto p-4 bg-muted/30 font-mono text-xs">
          <pre className="text-foreground leading-relaxed whitespace-pre-wrap break-all">{activeJson}</pre>
        </div>
      ) : (
        <div className="max-h-[620px] overflow-auto p-4 sm:p-5 space-y-5">
          {/* Globals Color Palette with Click to Copy */}
          {Object.keys(colors).length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-primary" />
                  Detected Global Palette (Click swatch to copy)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {Object.keys(colors).length} colors identified
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(colors).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleCopyColor(key, val)}
                    title={`Click to copy ${val}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary/50 hover:bg-secondary/60 transition-all cursor-pointer group"
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/15 shadow-inner shrink-0"
                      style={{ backgroundColor: val }}
                    />
                    <span className="text-muted-foreground font-mono text-[11px]">{key}:</span>
                    <span className="font-mono font-semibold text-foreground group-hover:text-primary">
                      {val}
                    </span>
                    {copiedHex === val && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search bar & collapse controls */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by section, role, or text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-border bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                className="px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px]"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                className="px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px]"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Structured hierarchy */}
          <div className="space-y-3">
            {pages.map((page, pageIdx) => {
              const sections = (page.sections as Array<Record<string, unknown>>) || [];
              const pageKey = `page-${pageIdx}`;
              const isPageCollapsed = Boolean(collapsedNodes[pageKey]);
              let totalPageElements = 0;
              for (const s of sections) {
                const sChildren = (s.children || s.nodes || s.elements || []) as Array<Record<string, unknown>>;
                totalPageElements += countTotalNodes(sChildren);
              }

              return (
                <div key={pageKey} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div
                    onClick={() => toggleNode(pageKey)}
                    className="flex cursor-pointer items-center justify-between bg-secondary/50 px-3.5 py-2.5 text-xs font-semibold hover:bg-secondary/80 select-none transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isPageCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="text-foreground">Page: {String(page.name || `Viewport #${pageIdx + 1}`)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{sections.length} Sections</Badge>
                      <Badge variant="neutral">{totalPageElements} Elements</Badge>
                    </div>
                  </div>

                  {!isPageCollapsed && (
                    <div className="p-3 space-y-2.5">
                      {sections.map((section, secIdx) => {
                        const secKey = `${pageKey}-sec-${secIdx}`;
                        const isSecCollapsed = Boolean(collapsedNodes[secKey]);
                        const role = String(section.role || 'content');
                        const children = (section.children || section.nodes || section.elements || []) as Array<Record<string, unknown>>;
                        const totalElements = countTotalNodes(children);

                        return (
                          <div key={secKey} className="rounded-lg border border-border bg-card p-3">
                            <div
                              onClick={() => toggleNode(secKey)}
                              className="flex cursor-pointer items-center justify-between text-xs select-none"
                            >
                              <div className="flex items-center gap-2">
                                {isSecCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-foreground capitalize">
                                  {role} Section #{secIdx + 1}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {totalElements} element{totalElements === 1 ? '' : 's'}
                              </span>
                            </div>

                            {!isSecCollapsed && children.length > 0 && (
                              <div className="mt-2.5 space-y-1.5 pl-2 border-l-2 border-border text-xs">
                                {renderNodeTree(children, secKey)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
