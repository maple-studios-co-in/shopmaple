# Search and answer engines

The storefront describes itself to search engines (Google, Bing) and answer engines (ChatGPT,
Perplexity, Google AI Overviews) from one module, `apps/web/lib/seo.ts`.

## Launch switch

- `SEO_INDEXING=on` in `store.env` opens the store to crawlers. Anything else keeps it out:
  `robots.txt` disallows everything and every page carries `noindex, nofollow`.
- It is read at request time. Change `store.env`, then `pm2 restart shopmaple-web`; no rebuild.
- `/admin` and `/api` always send `X-Robots-Tag: noindex, nofollow`.
- `SITE_URL` (default `https://store.maplefurnishers.com`) is the address used for canonical
  links, the sitemap and structured data.

## What each page publishes

| Where | Signals |
| --- | --- |
| Every page | Title template, description, Open Graph and Twitter defaults; `FurnitureStore` (address, phone, email, Instagram/LinkedIn from the footer edit) and `WebSite` with site search |
| `/robots.txt` | Allows the public store, disallows admin, API, cart, checkout, account and favourites, links the sitemap |
| `/sitemap.xml` | Fixed pages, collections, published content pages, policies, articles, and every published product with its photos and last change |
| Products | Own title, description (160 characters), one canonical address for all variants, share photo; `Product` with an `Offer` per priced variant (INR, availability) and `BreadcrumbList` |
| Collections | Canonical without sort or filter parameters |
| Articles | Description, publish date, cover; `Article` and `BreadcrumbList` |

## At launch

1. Set `SEO_INDEXING=on`, restart the web process, check `/robots.txt`.
2. Add the store to Google Search Console and Bing Webmaster Tools and submit `/sitemap.xml`.
3. Map old Shopify addresses to the new ones with permanent redirects.
4. Check product pages with Google's Rich Results Test.
