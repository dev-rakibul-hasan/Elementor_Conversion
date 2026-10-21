'use client';

import React, { useState } from 'react';
import {
  ImageIcon,
  Maximize2,
  Download,
  Copy,
  Check,
  Layers,
  FileCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Asset, ConversionJobWithStages, API_BASE_URL } from '@/lib/api';
import toast from 'react-hot-toast';

interface AssetPreviewsProps {
  assets: Asset[];
  job?: ConversionJobWithStages | null;
  projectName?: string;
  className?: string;
}

export function AssetPreviews({ assets, job, projectName = 'Project', className = '' }: AssetPreviewsProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    assets.find((a) => a.id === job?.sourceAssetId)?.id || assets[0]?.id || ''
  );
  const [viewMode, setViewMode] = useState<'comparison' | 'gallery' | 'details'>('comparison');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) || assets[0];
  const sourceAsset = assets.find((a) => a.id === job?.sourceAssetId) || assets[0];
  const subAssets = assets.filter((a) => a.id !== sourceAsset?.id);

  const getAssetUrl = (asset?: Asset): string => {
    if (!asset?.storagePath) return '';
    return `${API_BASE_URL}/storage/${asset.storagePath}`;
  };

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      toast.success('SHA-256 hash copied to clipboard');
      setTimeout(() => setCopiedHash(null), 2000);
    } catch {
      toast.error('Failed to copy hash');
    }
  };

  const handleDownload = (asset: Asset) => {
    const url = getAssetUrl(asset);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.fileName || 'asset.png';
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  };

  const formatFileSize = (bytes: number | string): string => {
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num) || num <= 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!assets || assets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground bg-card">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        No image assets found for this project yet.
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header controls & Mode Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Asset Previews & Inspection</h3>
            <p className="text-xs text-muted-foreground">
              {assets.length} total registered asset{assets.length > 1 ? 's' : ''} &bull; {subAssets.length} extracted sub-asset{subAssets.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="inline-flex rounded-lg border border-border p-1 bg-secondary/50 text-xs font-medium w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode('comparison')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'comparison'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'gallery'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Asset Gallery ({assets.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('details')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'details'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Technical Metadata
            </button>
          </div>
        </div>
      </div>

      {/* Mode 1: Side-by-Side Comparison */}
      {viewMode === 'comparison' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Source Upload */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Original Mockup (Input)
                </CardTitle>
                {sourceAsset && (
                  <Badge variant="neutral" className="text-[10px]">
                    {sourceAsset.width && sourceAsset.height
                      ? `${sourceAsset.width} × ${sourceAsset.height} px`
                      : 'Dimensions loading'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="relative rounded-lg border border-border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[300px] max-h-[500px]">
                {sourceAsset ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={getAssetUrl(sourceAsset)}
                    alt={sourceAsset.fileName || 'Original design mockup'}
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
                    className="max-h-[460px] w-auto object-contain transition-transform duration-200"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50" font-size="12">Preview Unavailable</text></svg>';
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">No source mockup</p>
                )}
              </div>

              {/* Source Asset Info Footer */}
              {sourceAsset && (
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                  <span className="truncate max-w-[200px] font-mono text-[11px]">{sourceAsset.fileName}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatFileSize(sourceAsset.sizeBytes)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleDownload(sourceAsset)}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Converted Preview / Active Asset Selection */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Extracted Assets & Canvas Structure
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-muted-foreground w-9 text-center">{zoomLevel}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(100)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground ml-1"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="relative rounded-lg border border-border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[300px] max-h-[500px]">
                {selectedAsset ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={getAssetUrl(selectedAsset)}
                    alt={selectedAsset.fileName || 'Extracted preview asset'}
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
                    className="max-h-[460px] w-auto object-contain transition-transform duration-200"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50" font-size="12">Preview Unavailable</text></svg>';
                    }}
                  />
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">Select an asset below to preview</p>
                  </div>
                )}
              </div>

              {/* Asset Selector Strip */}
              {assets.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Select Display Asset:
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {assets.map((asset) => {
                      const isSelected = asset.id === selectedAssetId;
                      const isSource = asset.id === sourceAsset?.id;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setSelectedAssetId(asset.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs shrink-0 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                              : 'border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isSource ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                          <span className="truncate max-w-[120px]">{asset.fileName}</span>
                          {isSource && <span className="text-[9px] opacity-75 font-mono">(source)</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mode 2: Asset Gallery Grid */}
      {viewMode === 'gallery' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => {
            const isSource = asset.id === sourceAsset?.id;
            return (
              <Card
                key={asset.id}
                className={`overflow-hidden border transition-all ${
                  asset.id === selectedAssetId ? 'border-primary shadow-sm' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="relative aspect-video bg-muted/20 border-b border-border flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getAssetUrl(asset)}
                    alt={asset.fileName}
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50" font-size="10">No Preview</text></svg>';
                    }}
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant={isSource ? 'info' : 'success'} className="text-[9px] px-1.5 py-0">
                      {isSource ? 'Source Mockup' : 'Extracted'}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-3 space-y-2 text-xs">
                  <div className="font-semibold text-foreground truncate" title={asset.fileName}>
                    {asset.fileName}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>{asset.mimeType}</span>
                    <span>{formatFileSize(asset.sizeBytes)}</span>
                  </div>
                  {asset.width && asset.height && (
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {asset.width} × {asset.height} px
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => handleCopyHash(asset.sha256)}
                      title="Copy SHA-256"
                    >
                      {copiedHash === asset.sha256 ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 mr-1" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 mr-1" />
                      )}
                      SHA-256
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => handleDownload(asset)}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Mode 3: Technical Metadata Table */}
      {viewMode === 'details' && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" /> Registered Asset Manifest
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Format</th>
                    <th className="px-4 py-3">Resolution</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Storage Provider</th>
                    <th className="px-4 py-3">SHA-256 Checksum</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {assets.map((asset) => {
                    const isSource = asset.id === sourceAsset?.id;
                    return (
                      <tr key={asset.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">
                          {asset.fileName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={isSource ? 'info' : 'success'} className="text-[10px]">
                            {isSource ? 'Source' : 'Sub-Asset'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono">{asset.mimeType}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono">
                          {asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatFileSize(asset.sizeBytes)}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] uppercase bg-secondary px-1.5 py-0.5 rounded">
                            {asset.storageProvider}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleCopyHash(asset.sha256)}
                            className="font-mono text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 group"
                            title="Click to copy full hash"
                          >
                            <span>{asset.sha256 ? `${asset.sha256.slice(0, 10)}...` : '—'}</span>
                            {copiedHash === asset.sha256 ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDownload(asset)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

