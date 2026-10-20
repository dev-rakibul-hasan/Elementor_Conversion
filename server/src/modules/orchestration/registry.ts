/**
 * Pipeline Stage Registry & Typed Stage Contracts
 * Architecture Lead: Mubasshir
 * 
 * Defines the authoritative inputs, outputs, validation contracts,
 * prerequisites, and execution registry for all seven stages of the conversion pipeline.
 */

import {
  PIPELINE_STAGE_ORDER,
  STAGE_DESCRIPTORS,
  type PipelineStage,
  type StageDescriptor,
} from '../../contracts/stages.js';
import type { DIRDocument, DIRValidationIssue, DIRCanvasBounds, DIRColorPalette } from '../dir/index.js';
import type { NativeElementorTemplate } from '../../contracts/api.js';

// ─── Stage 1: Upload & Security Validation ───────────────────────────

export interface Stage1UploadValidationInput {
  jobId: string;
  projectId: string;
  sourceAssetId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
}

export interface Stage1UploadValidationOutput {
  verifiedSha256: string;
  verifiedMimeType: string;
  verifiedWidth: number;
  verifiedHeight: number;
  storagePath: string;
  isCanvasIsolated: boolean;
  sanitizedFileName: string;
  validatedAt: string;
}

// ─── Stage 2: Stage A - Vision Understanding & Canvas Isolation ───────

export interface Stage2ImageAnalysisInput {
  jobId: string;
  projectId: string;
  sourceAsset: Stage1UploadValidationOutput;
  preferredThemeBackground?: string;
  mode?: 'balanced' | 'fast' | 'fidelity';
}

export interface Stage2ImageAnalysisOutput {
  canvasBounds: DIRCanvasBounds;
  detectedPalette: DIRColorPalette;
  visualSectionsSummary: Array<{ role: string; yMin: number; yMax: number; label: string }>;
  artworkBoundingBoxes: Array<{ id: string; role: string; x: number; y: number; width: number; height: number }>;
  perceptionModelUsed: string;
  confidenceScore: number;
}

// ─── Stage 3: Stage B - Canonical DIR Generation ──────────────────────

export interface Stage3DIRGenerationInput {
  jobId: string;
  projectId: string;
  sourceAsset: Stage1UploadValidationOutput;
  analysis: Stage2ImageAnalysisOutput;
  targetElementorVersion?: string;
  containerMaxWidth?: number;
}

export interface Stage3DIRGenerationOutput {
  rawDIRDocument: DIRDocument;
  generationModelUsed: string;
  generationTimestamp: string;
}

// ─── Stage 4: DIR Verification & Self-Repair Gate ────────────────────

export interface Stage4DIRValidationInput {
  jobId: string;
  rawDIRDocument: DIRDocument;
  allowSelfHealing?: boolean;
  maxHealingAttempts?: number;
}

export interface Stage4DIRValidationOutput {
  validatedDIRDocument: DIRDocument;
  isValid: boolean;
  selfHealed: boolean;
  healingAttempts: number;
  issues: DIRValidationIssue[];
  warnings: string[];
}

// ─── Stage 5: Stage C - Elementor AST Compilation ────────────────────

export interface Stage5ElementorGenerationInput {
  jobId: string;
  validatedDIRDocument: DIRDocument;
  targetVersion?: string; // e.g. "4.3.5"
}

export interface Stage5ElementorGenerationOutput {
  elementorTemplate: NativeElementorTemplate;
  totalSections: number;
  totalContainers: number;
  totalWidgets: number;
  widgetSlugs: string[];
  compiledAt: string;
}

// ─── Stage 6: Stage D - Quality Gate & Self-Healing ───────────────────

export interface Stage6ElementorValidationInput {
  jobId: string;
  elementorTemplate: NativeElementorTemplate;
  referenceDIRDocument: DIRDocument;
  allowSelfHealing?: boolean;
  maxHealingAttempts?: number;
}

export interface Stage6ElementorValidationOutput {
  validatedTemplate: NativeElementorTemplate;
  isValid: boolean;
  selfHealed: boolean;
  healingAttempts: number;
  syntaxErrors: string[];
  fidelityAudit: {
    typographyPreserved: boolean;
    layoutPreserved: boolean;
    noLegacySectionsEmitted: boolean;
    widgetSlugIntegrityVerified: boolean;
  };
}

// ─── Stage 7: Preview Rendering & QA Inspection ──────────────────────

export interface Stage7PreviewRenderingInput {
  jobId: string;
  validatedTemplate: NativeElementorTemplate;
  validatedDIRDocument: DIRDocument;
  sourceAsset: Stage1UploadValidationOutput;
}

export interface Stage7PreviewRenderingOutput {
  previewHtml?: string;
  previewImageUrl?: string;
  assetManifest: Array<{ id: string; role: string; resolvedUrl: string }>;
  readinessScore: number; // 0 to 100
  isDeployReady: boolean;
}

// ─── Stage Registry Map & Types ──────────────────────────────────────

export interface PipelineStageIO {
  upload_validation: { input: Stage1UploadValidationInput; output: Stage1UploadValidationOutput };
  image_analysis: { input: Stage2ImageAnalysisInput; output: Stage2ImageAnalysisOutput };
  dir_generation: { input: Stage3DIRGenerationInput; output: Stage3DIRGenerationOutput };
  dir_validation: { input: Stage4DIRValidationInput; output: Stage4DIRValidationOutput };
  elementor_generation: { input: Stage5ElementorGenerationInput; output: Stage5ElementorGenerationOutput };
  elementor_validation: { input: Stage6ElementorValidationInput; output: Stage6ElementorValidationOutput };
  preview_rendering: { input: Stage7PreviewRenderingInput; output: Stage7PreviewRenderingOutput };
}

/**
 * Stage Registry defining properties and dependency requirements for every stage.
 */
export class StageRegistry {
  private static readonly STAGES: Record<PipelineStage, StageDescriptor> = STAGE_DESCRIPTORS;

  public static getStageDescriptor(stage: PipelineStage): StageDescriptor {
    const desc = this.STAGES[stage];
    if (!desc) {
      throw new Error(`Unknown pipeline stage: "${stage}"`);
    }
    return desc;
  }

  public static getExecutionOrder(): readonly PipelineStage[] {
    return PIPELINE_STAGE_ORDER;
  }

  public static getPrerequisiteStage(stage: PipelineStage): PipelineStage | null {
    const index = PIPELINE_STAGE_ORDER.indexOf(stage);
    if (index <= 0) return null;
    const prereq = PIPELINE_STAGE_ORDER[index - 1];
    return prereq !== undefined ? prereq : null;
  }

  public static isDownstreamOf(stageA: PipelineStage, stageB: PipelineStage): boolean {
    const idxA = PIPELINE_STAGE_ORDER.indexOf(stageA);
    const idxB = PIPELINE_STAGE_ORDER.indexOf(stageB);
    return idxA > idxB;
  }
}
