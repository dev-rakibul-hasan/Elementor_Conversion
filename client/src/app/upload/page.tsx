'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../../components/layout/header';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { readStorage } from '../../lib/browser-storage';
import toast from 'react-hot-toast';
import {
  UploadCloud,
  FileImage,
  CheckCircle,
  Zap,
  LogIn,
  Layers,
  ArrowLeft,
  Sparkles,
  Info,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { staggerContainer, staggerItem, EASE_OUT_EXPO } from '../../lib/animations';

export default function UploadPage() {
  const router = useRouter();
  const { isAuthenticated, setAuth } = useAuthStore();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickLoginLoading, setQuickLoginLoading] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxFiles: 1,
    onDropRejected: () => toast.error('Select one PNG or JPEG image.'),
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        if (!projectName) {
          const autoName = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          setProjectName(autoName);
        }
      }
    },
  });

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select an image file first');
      return;
    }
    if (!projectName.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    // Auto-login with dev user if guest
    const storedToken = useAuthStore.getState().token || readStorage('dte_token');
    if (!storedToken && process.env.NODE_ENV === 'production') {
      toast.error('Please sign in before uploading designs');
      router.push('/auth/login');
      return;
    }
    if (!storedToken) {
      try {
        toast('Signing in automatically as dev user...', { icon: '🔑' });
        const res = await api.auth.quickLogin();
        setAuth(res.user, res.token);
      } catch {
        toast.error('Please sign in before uploading designs');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.upload.uploadImage(selectedFile, projectName, undefined, description);
      toast.success('Design uploaded successfully! Conversion pipeline queued.');
      router.push('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <motion.main
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6"
      >
        {/* Navigation Breadcrumb */}
        <motion.div variants={staggerItem}>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                New Design Conversion
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your screenshot or mockup. We will parse the layout, extract styles, and compile a native Elementor JSON template.
              </p>
            </div>
            <Badge variant="info" className="self-start sm:self-auto font-mono text-[11px]">
              Flexbox Container v3
            </Badge>
          </div>
        </motion.div>

        {/* Guest prompt banner */}
        <motion.div variants={staggerItem}>
          {!isAuthenticated && (
            <Card className="border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-primary" /> Guest Mode Notice
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {process.env.NODE_ENV === 'production' ? 'Sign in to upload and convert your designs.' : 'Submitting an upload will sign you into the local development account.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={process.env.NODE_ENV === 'production' ? () => router.push('/auth/login') : handleQuickDevLogin}
                    isLoading={quickLoginLoading}
                    className="flex items-center gap-1.5"
                    leftIcon={<Zap className="w-3.5 h-3.5" />}
                  >
                    {process.env.NODE_ENV === 'production' ? 'Sign In' : '1-Click Sign-In'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </motion.div>

        {/* Upload & Form Section */}
        <form onSubmit={handleUpload} className="space-y-6">
          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <FileImage className="w-5 h-5 text-primary" /> 1. Upload Design Screenshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <motion.div
                  {...(getRootProps() as Record<string, unknown>)}
                  animate={isDragActive ? { scale: 1.01 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : selectedFile
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <AnimatePresence mode="wait">
                      {selectedFile ? (
                        <motion.div
                          key="file"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"
                        >
                          <CheckCircle className="w-7 h-7" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="upload"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: isDragActive ? -6 : 0 }}
                          exit={{ opacity: 0, scale: 0.7 }}
                          className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                            isDragActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          <UploadCloud className="w-6 h-6" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {selectedFile ? (
                      <div className="space-y-1 text-center">
                        <div className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                          <span>{selectedFile.name}</span>
                          <Badge variant="neutral" className="text-[10px] font-mono">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Drop another image or click to replace
                        </p>
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="text-xs text-rose-500 hover:text-rose-600 inline-flex items-center gap-1 font-medium mt-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove image
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-center">
                        <div className="text-sm font-semibold text-foreground">
                          {isDragActive ? 'Release to drop screenshot here' : 'Drop your mockup here, or browse files'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Supports PNG, JPG and JPEG (Full-height landing pages supported)
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Preview Box */}
                <AnimatePresence>
                  {previewUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                      className="rounded-xl border border-border overflow-hidden bg-secondary/40"
                    >
                      <div className="px-4 py-2.5 bg-secondary/80 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <Maximize2 className="w-3.5 h-3.5 text-primary" /> Visual Inspection Preview
                        </span>
                        <span>Scrollable tall container</span>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-4 flex justify-center bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Screenshot preview"
                          className="max-w-full h-auto rounded-lg shadow-md border border-border object-contain"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" /> 2. Project Specification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="Project Title"
                  placeholder="e.g. Modern SaaS Landing Page"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                />
                <Input
                  label="Description (Optional)"
                  placeholder="e.g. Hero section + 3-feature grid with responsive tablet/mobile overrides"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Action buttons */}
          <motion.div variants={staggerItem} className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedFile}
              isLoading={isSubmitting}
              className="shadow-lg shadow-primary/20"
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {isSubmitting ? 'Processing Pipeline...' : 'Start Conversion Pipeline'}
            </Button>
          </motion.div>
        </form>
      </motion.main>
    </div>
  );
}
