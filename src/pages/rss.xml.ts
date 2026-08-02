import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { publishedPosts } from '../lib/queries';

export async function GET(context: APIContext) {
  const posts = await publishedPosts();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      // No trailing slash — the one spelling every internal link uses.
      link: `/blog/${post.id}`,
    })),
  });
}
