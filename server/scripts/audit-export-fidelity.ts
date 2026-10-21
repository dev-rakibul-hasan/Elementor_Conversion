/** Rebuild a completed conversion locally for inspection; never updates saved jobs. */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/index.js';
import { cropAsset, expandClippedCompositeBounds } from '../src/modules/storage/image-processor.js';
import { convertDIRToElementor } from '../src/modules/elementor/generator.js';
import { serializeElementorTemplate } from '../src/modules/elementor/serializer.js';
import { validateElementor } from '../src/modules/elementor/validator.js';
import { auditDIRContent } from '../src/modules/conversion/content-audit.js';
import type { DIRDocument } from '../src/modules/dir/types.js';

const db = new PrismaClient({ log: [] });
try {
  const id = process.argv[2];
  const job = id ? await db.conversionJob.findUnique({ where: { id } })
    : await db.conversionJob.findFirst({ where: { status: 'preview_ready' }, orderBy: { createdAt: 'desc' } });
  if (!job?.dirArtifact || !job.sourceAssetId) throw new Error('No completed conversion with source image found');
  const source = await db.asset.findUniqueOrThrow({ where: { id: job.sourceAssetId } });
  if (source.storageProvider !== 'local') throw new Error('This local diagnostic requires a local source image');
  const storageRoot = path.resolve(env.LOCAL_STORAGE_PATH);
  const sourcePath = path.resolve(storageRoot, source.storagePath);
  if (path.relative(storageRoot, sourcePath).startsWith('..')) throw new Error('Source path outside storage root');
  if (!/^[a-z0-9-]+$/i.test(job.id)) throw new Error('Invalid diagnostic job ID');
  const folder = path.join(storageRoot, 'diagnostics', job.id);
  await fs.mkdir(folder, { recursive: true });
  const buffer = await fs.readFile(sourcePath);
  const dir = structuredClone(job.dirArtifact) as unknown as DIRDocument;
  const composites = dir.assets.filter((asset) => asset.composite_graphic_asset && asset.sourceRect);
  const expansions = await expandClippedCompositeBounds(buffer, composites.map((asset) => asset.sourceRect!));
  const corrections = composites.map((asset, index) => ({ id: asset.id, before: asset.sourceRect!, after: expansions[index] }));
  composites.forEach((asset, index) => { asset.sourceRect = expansions[index]; });
  for (const [index, asset] of dir.assets.entries()) {
    if (!asset.sourceRect) continue;
    const name = `${index}-${asset.id.replace(/[^a-z0-9_-]/gi, '-')}.png`;
    await fs.writeFile(path.join(folder, name), await cropAsset(buffer, asset.sourceRect));
    asset.placeholder = `/storage/diagnostics/${job.id}/${name}`;
  }
  const visit = (node: any) => {
    if (node.kind === 'image') {
      const asset = dir.assets.find((asset) => asset.id === node.assetId);
      if (asset?.placeholder) node.url = asset.placeholder;
      const correction = corrections.find((entry) => entry.id === node.assetId);
      if (correction && node.styles) {
        if (node.styles.width === correction.before.width) node.styles.width = correction.after.width;
        if (node.styles.height === correction.before.height) node.styles.height = correction.after.height;
      }
    }
    (node.children || []).forEach(visit);
    for (const item of [...(node.tabs || []), ...(node.items || [])]) (item.children || []).forEach(visit);
  };
  dir.pages.forEach((page) => page.sections.forEach(visit));
  const compiled = convertDIRToElementor(dir);
  const serialized = serializeElementorTemplate(compiled.document);
  const document = JSON.parse(serialized);
  auditDIRContent(dir, document);
  const validation = validateElementor(document);
  if (!validation.valid) throw new Error(JSON.stringify(validation.errors));
  await fs.writeFile(path.join(folder, 'corrected-elementor.json'), serialized);
  const report = {
    jobId: job.id, sourceImage: { width: source.width, height: source.height },
    cropCorrections: corrections, validation: 'passed', renderedComparisonPerformed: false,
    notes: ['Recompiled from the existing DIR; source perception inaccuracies may remain.',
      'Pixel-supported expansion includes clipped artwork without replacing uncertain crop coordinates.',
      'Saved conversion jobs and original artifacts were not modified.'],
    warnings: compiled.report.warnings,
  };
  await fs.writeFile(path.join(folder, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ folder, ...report }));
} finally {
  await db.$disconnect();
}
