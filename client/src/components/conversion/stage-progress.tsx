import React from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  CircleDashed, 
  AlertCircle, 
  Clock, 
  Loader2, 
  Sparkles, 
  FileCheck, 
  Palette, 
  Upload, 
  Eye, 
  Send 
} from 'lucide-react';
import { StageName, StageStatus, JobStage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EASE_OUT_EXPO } from '@/lib/animations';

interface StageProgressProps {
  currentStage?: StageName | null;
  overallStatus: string;
  stages?: JobStage[];
  errorMessage?: string | null;
  errorDetails?: unknown;
  onRetry?: () => void;
}

interface StepConfig {
  key: StageName;
  label: string;
  description: string;
  icon: React.ElementType;
}

const PIPELINE_STEPS: StepConfig[] = [
  {
    key: 'upload_validation',
    label: 'Upload & Security',
    description: 'Magic bytes check, dimension verification & secure storage',
    icon: Upload,
  },
  {
    key: 'image_analysis',
    label: 'Stage A: Vision & Canvas Isolation',
    description: 'Auto mockup cropping, canvas bounds & visual perception',
    icon: Sparkles,
  },
  {
    key: 'dir_generation',
    label: 'Stage B: Canonical DIR Schema',
    description: 'Nested Flexbox tree, typography spans & pill forms',
    icon: Palette,
  },
  {
    key: 'dir_validation',
    label: 'DIR Contract Verification',
    description: 'Deterministic schema validation & bounded self-repair',
    icon: FileCheck,
  },
  {
    key: 'elementor_generation',
    label: 'Stage C: Elementor AST Generator',
    description: 'Modern Flexbox containers, 7-char IDs & direct hex colors',
    icon: CircleDashed,
  },
  {
    key: 'elementor_validation',
    label: 'Stage D: Self-Healing & Verification',
    description: 'Widget restoration audit & 100% deployable schema gate',
    icon: FileCheck,
  },
  {
    key: 'preview_rendering',
    label: 'Preview & QA',
    description: 'Generating visual preview and inspectable artifacts',
    icon: Eye,
  },
  {
    key: 'publishing',
    label: 'WordPress Canvas Page Publish',
    description: 'Direct publishing to WordPress Pages (post_type: page)',
    icon: Send,
  },
];

export function StageProgress({
  currentStage,
  overallStatus,
  stages = [],
  errorMessage,
  errorDetails,
  onRetry,
}: StageProgressProps) {
  // Map recorded stage records by stage key
  const stageMap = new Map<StageName, JobStage>();
  stages.forEach((st) => {
    stageMap.set(st.stage, st);
  });

  const getStepStatus = (stepKey: StageName, stepIndex: number): StageStatus => {
    // If recorded in stages list:
    const recorded = stageMap.get(stepKey);
    if (recorded) {
      return recorded.status;
    }

    if (overallStatus === 'failed' && currentStage === stepKey) {
      return 'failed';
    }

    if (overallStatus === 'published' || overallStatus === 'preview_ready') {
      const targetIndex = overallStatus === 'published' ? 7 : 6;
      if (stepIndex <= targetIndex) return 'completed';
      return 'pending';
    }

    // Determine by index relative to currentStage
    const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStage);
    if (currentIndex === -1) {
      return stepIndex === 0 && overallStatus !== 'queued' ? 'processing' : 'pending';
    }

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) {
      return overallStatus === 'failed' ? 'failed' : 'processing';
    }
    return 'pending';
  };

  return (
    <div className="space-y-6">
      {/* Overall Status Banner if failed */}
      {overallStatus === 'failed' && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>Conversion Pipeline Encountered An Error</span>
          </div>
          <p className="text-xs text-destructive/90 leading-relaxed font-mono">
            {errorMessage || 'Job failed during execution. Inspect details below.'}
          </p>
          {errorDetails ? (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/20 p-2 text-[11px] text-destructive/80 font-mono">
              {typeof errorDetails === 'string'
                ? errorDetails
                : JSON.stringify(errorDetails, null, 2)}
            </pre>
          ) : null}
          {onRetry && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90 transition-colors"
              >
                Retry from last failed stage
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Stage Flow */}
      <div className="relative border-l border-border/80 ml-4 pl-6 space-y-6">
        {PIPELINE_STEPS.map((step, idx) => {
          const status = getStepStatus(step.key, idx);
          const recorded = stageMap.get(step.key);
          const StepIcon = step.icon;

          return (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.5, ease: EASE_OUT_EXPO }}
              className="relative group"
            >
              {/* Node Icon on Timeline */}
              <motion.div
                animate={
                  status === 'processing'
                    ? { scale: [1, 1.15, 1] }
                    : { scale: 1 }
                }
                transition={
                  status === 'processing'
                    ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.3 }
                }
                className={cn(
                  'absolute -left-[37px] top-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-all',
                  status === 'completed' &&
                    'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20',
                  status === 'processing' &&
                    'border-primary bg-primary/20 text-primary shadow-md shadow-primary/30',
                  status === 'failed' &&
                    'border-destructive bg-destructive text-white',
                  status === 'pending' &&
                    'border-border bg-card text-muted-foreground'
                )}
              >
                {status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : status === 'processing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === 'failed' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5" />
                )}
              </motion.div>

              {/* Step Content */}
              <motion.div
                whileHover={{ x: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  status === 'processing'
                    ? 'border-primary/50 bg-primary/5 shadow-sm'
                    : 'border-border/60 bg-card/60'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {step.label}
                    </span>
                    {recorded?.providerName && (
                      <span className="text-[10px] font-mono rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">
                        {recorded.providerName} / {recorded.modelName || 'default'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {recorded?.durationMs && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        {(recorded.durationMs / 1000).toFixed(2)}s
                      </span>
                    )}
                    {status === 'completed' && (
                      <Badge variant="success">Completed</Badge>
                    )}
                    {status === 'processing' && (
                      <Badge variant="info" withDot>In Progress</Badge>
                    )}
                    {status === 'failed' && (
                      <Badge variant="error">Failed</Badge>
                    )}
                    {status === 'pending' && (
                      <Badge variant="neutral">Pending</Badge>
                    )}
                  </div>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {step.description}
                </p>

                {recorded?.errorMessage && (
                  <div className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {recorded.errorMessage}
                  </div>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
