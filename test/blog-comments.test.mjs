import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('S3 alternatives blog post exists with required frontmatter', async () => {
  const raw = await readFile(
    new URL('src/content/posts/open-source-alternatives-to-amazon-s3.md', root),
    'utf8',
  );
  assert.match(raw, /^---[\s\S]*title:\s*Open Source Alternatives To Amazon S3/m);
  assert.match(raw, /summary:/);
  assert.match(raw, /author:/);
  assert.match(raw, /published:/);
  assert.match(raw, /MinIO/);
  assert.match(raw, /Ceph/);
  assert.match(raw, /Garage/);
});

test('blog comments collection seeds the S3 post thread', async () => {
  const welcome = await readFile(
    new URL('src/content/comments/s3-alternatives-welcome.md', root),
    'utf8',
  );
  assert.match(welcome, /post:\s*open-source-alternatives-to-amazon-s3/);
  assert.match(welcome, /author:/);
});

test('Comments component and giscus config are wired for NYT-style tray', async () => {
  const comments = await readFile(new URL('src/components/Comments.astro', root), 'utf8');
  const blog = await readFile(new URL('src/pages/blog/[...id].astro', root), 'utf8');
  const giscus = await readFile(new URL('src/lib/giscus.ts', root), 'utf8');

  assert.match(comments, /nyt-comments/);
  assert.match(comments, /Reader picks/);
  assert.match(blog, /Comments/);
  assert.match(blog, /#comments/);
  assert.match(giscus, /R_kgDOT4AJMQ/);
  assert.match(giscus, /bigshort2022\/unite4ai\.github\.io/);
});
