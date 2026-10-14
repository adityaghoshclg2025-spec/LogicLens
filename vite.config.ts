import { defineConfig } from 'vite';

// GitHub Pages project sites live under /<repository-name>/; keep local Vite
// development and preview at the domain root.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/LogicLens/' : '/'
});
