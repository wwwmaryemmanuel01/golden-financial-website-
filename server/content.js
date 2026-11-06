/* Public read-only editorial API. Publication is restricted to the signed
   system connector's validated blog_posts setting; customers cannot author. */
import * as catalog from './catalog.js';
import CONTENT from '../shared/content.mjs';
import { HttpError } from './http.js';
const summary = ({ sections, ...post }) => ({ ...post, readMinutes: CONTENT.readingMinutes(post) });
const ordered = () => [...catalog.blogPosts()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
const metadata = () => ({ source: 'backend', checkedAt: new Date().toISOString(), version: `published-${CONTENT.VERSION}`, categories: CONTENT.CATEGORIES, notice: 'Published educational articles. Refresh to check for updates; this is not a news wire.' });
export async function listPosts(ctx) {
  const search = String(ctx.url.searchParams.get('search') || '').slice(0, 200).toLowerCase();
  const category = String(ctx.url.searchParams.get('category') || '').slice(0, 100);
  if (category && !CONTENT.CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown article category.');
  const posts = ordered().filter(p => (!category || p.category === category) && `${p.title} ${p.excerpt} ${p.tags.join(' ')}`.toLowerCase().includes(search));
  return { posts: posts.map(summary), total: posts.length, ...metadata() };
}
export async function getPost(ctx) {
  const posts = ordered(), index = posts.findIndex(p => p.slug === ctx.params.slug);
  if (index < 0) throw new HttpError(404, 'Article not found.');
  const post = posts[index];
  return { post: { ...post, readMinutes: CONTENT.readingMinutes(post) }, previous: posts[index + 1] ? summary(posts[index + 1]) : null, next: posts[index - 1] ? summary(posts[index - 1]) : null,
    related: posts.filter(p => p.slug !== post.slug && (p.category === post.category || (p.productId && p.productId === post.productId))).slice(0, 3).map(summary), ...metadata() };
}
