import { describe, expect, it } from 'vitest';

import { validateDoraCoverageContract } from '../../../../../frontend/scripts/quality/validate-dora-e2e-coverage.mjs';

const firstSpec = 'tests/frontend/e2e/process-register-framework.spec.ts';
const secondSpec = 'tests/frontend/e2e/asset-register-framework.spec.ts';

function validManifest() {
  return {
    version: 1,
    project: 'ci',
    requirements: [
      {
        id: 'DORA-PROCESS',
        description: 'Process register behavior',
        evidence: [{ spec: firstSpec, titleIncludes: 'Process register is covered' }],
      },
      {
        id: 'DORA-ASSET',
        description: 'Asset register behavior',
        evidence: [{ spec: secondSpec, titleIncludes: 'Asset register is covered' }],
      },
    ],
  };
}

function validSources() {
  return new Map([
    [firstSpec, "test('Process register is covered', async () => {});"],
    [secondSpec, "test('Asset register is covered', async () => {});"],
  ]);
}

function ciLine(spec: string, title: string) {
  return `[ci] › ${spec.replace('tests/frontend/e2e/', '')}:1:1 › ${title}`;
}

describe('DORA E2E coverage contract', () => {
  it('fails closed when a requirement evidence test is missing from the ci collection', () => {
    const manifest = validManifest();
    const collectionOutput = ciLine(firstSpec, 'Process register is covered');
    const sources = validSources();

    expect(() => validateDoraCoverageContract({ manifest, collectionOutput, sources }))
      .toThrow(/DORA-ASSET.*Asset register is covered/);
  });

  it('accepts a valid contract when every evidence test is collected exactly once', () => {
    const collectionOutput = [
      ciLine(firstSpec, 'Suite › Process register is covered'),
      ciLine(secondSpec, 'Suite › Asset register is covered'),
    ].join('\n');

    expect(() => validateDoraCoverageContract({
      manifest: validManifest(),
      collectionOutput,
      sources: validSources(),
    })).not.toThrow();
  });

  it.each([
    ['null manifest', null],
    ['unsupported version', { ...validManifest(), version: 2 }],
    ['wrong project', { ...validManifest(), project: 'chromium' }],
    ['empty requirements', { ...validManifest(), requirements: [] }],
  ])('rejects malformed contract shape: %s', (_label, manifest) => {
    expect(() => validateDoraCoverageContract({
      manifest,
      collectionOutput: '',
      sources: validSources(),
    })).toThrow(/DORA E2E coverage contract/i);
  });

  it('rejects empty and duplicate requirement IDs', () => {
    const emptyId = validManifest();
    emptyId.requirements[0]!.id = ' ';
    expect(() => validateDoraCoverageContract({
      manifest: emptyId,
      collectionOutput: '',
      sources: validSources(),
    })).toThrow(/requirement id/i);

    const duplicateId = validManifest();
    duplicateId.requirements[1]!.id = duplicateId.requirements[0]!.id;
    expect(() => validateDoraCoverageContract({
      manifest: duplicateId,
      collectionOutput: '',
      sources: validSources(),
    })).toThrow(/duplicate requirement id/i);
  });

  it('requires evidence and rejects duplicate evidence only within one requirement', () => {
    const emptyEvidence = validManifest();
    emptyEvidence.requirements[0]!.evidence = [];
    expect(() => validateDoraCoverageContract({
      manifest: emptyEvidence,
      collectionOutput: '',
      sources: validSources(),
    })).toThrow(/DORA-PROCESS.*evidence/i);

    const duplicateEvidence = validManifest();
    duplicateEvidence.requirements[0]!.evidence.push({ ...duplicateEvidence.requirements[0]!.evidence[0]! });
    expect(() => validateDoraCoverageContract({
      manifest: duplicateEvidence,
      collectionOutput: '',
      sources: validSources(),
    })).toThrow(/DORA-PROCESS.*duplicate evidence/i);

    const sharedEvidence = validManifest();
    sharedEvidence.requirements[1]!.evidence = [{ ...sharedEvidence.requirements[0]!.evidence[0]! }];
    expect(() => validateDoraCoverageContract({
      manifest: sharedEvidence,
      collectionOutput: ciLine(firstSpec, 'Process register is covered'),
      sources: validSources(),
    })).not.toThrow();
  });

  it.each([
    ['unsafe', '../process.spec.ts'],
    ['absolute', '/tmp/process.spec.ts'],
    ['outside E2E', 'frontend/src/process.spec.ts'],
    ['not a spec', 'tests/frontend/e2e/process.ts'],
  ])('rejects %s evidence paths', (_label, spec) => {
    const manifest = validManifest();
    manifest.requirements[0]!.evidence[0]!.spec = spec;
    expect(() => validateDoraCoverageContract({ manifest, collectionOutput: '', sources: validSources() }))
      .toThrow(/unsafe.*spec path/i);
  });

  it('rejects missing source files and disabled required specs', () => {
    const missingSources = new Map(validSources());
    missingSources.delete(secondSpec);
    expect(() => validateDoraCoverageContract({
      manifest: validManifest(),
      collectionOutput: '',
      sources: missingSources,
    })).toThrow(/missing required spec source.*asset-register-framework/i);

    const skippedSources = validSources();
    skippedSources.set(firstSpec, "test.describe.fixme('disabled', () => {});");
    expect(() => validateDoraCoverageContract({
      manifest: validManifest(),
      collectionOutput: '',
      sources: skippedSources,
    })).toThrow(/skip or fixme.*process-register-framework/i);
  });

  it('rejects a failed collection and ambiguous evidence matches', () => {
    expect(() => validateDoraCoverageContract({
      manifest: validManifest(),
      collectionOutput: '',
      collectionStatus: 1,
      sources: validSources(),
    })).toThrow(/collection failed.*1/i);

    const duplicateCollection = [
      ciLine(firstSpec, 'Process register is covered'),
      ciLine(firstSpec, 'Process register is covered again'),
      ciLine(secondSpec, 'Asset register is covered'),
    ].join('\n');
    expect(() => validateDoraCoverageContract({
      manifest: validManifest(),
      collectionOutput: duplicateCollection,
      sources: validSources(),
    })).toThrow(/DORA-PROCESS.*matched 2/i);
  });
});
