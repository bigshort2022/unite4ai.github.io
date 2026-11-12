#!/usr/bin/env bun
/**
 * Content gate — runs before the build, in CI on every pull request.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from '@unite4ai/core/validate';

const contentRoot = join(dirname(fileURLToPath(import.meta.url)), '../src/content');
const { errors, warnings } = await validateContent(contentRoot);

if (warnings.length) {
  console.log('\n\x1b[33mWarnings\x1b[0m');
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

if (errors.length) {
  console.error('\n\x1b[31mContent validation failed\x1b[0m\n');
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  console.error(`\n${errors.length} error(s). Fix these and push again — CI will re-run automatically.\n`);
  process.exit(1);
}

console.log('\n\x1b[32m✓ Content validation passed\x1b[0m — schemas, licenses, and checksums all clean.\n');
