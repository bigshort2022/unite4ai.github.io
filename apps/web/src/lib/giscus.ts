/**
 * Giscus (GitHub Discussions) powers live blog comments.
 * CSP already allows giscus.app + api.github.com in Base.astro.
 *
 * One-time setup (maintainers):
 * 1. Enable Discussions on the repo
 * 2. Create a category (e.g. "Blog Comments"), type: Announcements
 * 3. Install https://giscus.app on the repo and paste categoryId below
 */
export const giscusConfig = {
  repo: 'bigshort2022/unite4ai.github.io',
  repoId: 'R_kgDOT4AJMQ',
  category: 'Blog Comments',
  /** Empty until Discussions + giscus are configured; Comments.astro hides the embed. */
  categoryId: '',
  mapping: 'pathname' as const,
  strict: '0' as const,
  reactionsEnabled: '1' as const,
  emitMetadata: '1' as const,
  inputPosition: 'top' as const,
  theme: 'transparent_dark' as const,
  lang: 'en' as const,
};

export const giscusReady = Boolean(giscusConfig.categoryId);
