# Search and answer engines

The storefront describes itself to search engines (Google, Bing) and answer engines (ChatGPT,
Perplexity, Google AI Overviews) from one module, `apps/web/lib/seo.ts`.

## Launch switch

- `SEO_INDEXING=on` in `store.env` opens the store to search. Until then every response (pages,
  photos, error pages, the API) carries `X-Robots-Tag: noindex, nofollow` and pages carry a
  `noindex` robots tag. robots.txt still lets crawlers in, so pages already in search see the
  noindex and drop out (a page blocked by robots.txt can stay listed from links elsewhere).
- It is read at request time by `apps/web/proxy.ts`, the page metadata, robots.txt and the API.
  Change `store.env`, then restart `shopmaple-web` and `shopmaple-api`; no rebuild.
- After launch, admin, API, cart, checkout, account and favourites still say noindex, and
  robots.txt keeps crawlers off `/api/` only.
- `SITE_URL` (default `https://store.maplefurnishers.com`) is the address used for canonical
  links, the sitemap and structured data. A missing or malformed value falls back to the default.

## What each page publishes

| Where | Signals |
| --- | --- |
| Every page | Title template, description, Open Graph and Twitter defaults; `FurnitureStore` (address, phone, email, Instagram/LinkedIn from the footer edit) and `WebSite` with site search |
| `/robots.txt` | Allows everything except `/api/`; links the sitemap once indexing is on |
| `/sitemap.xml` | Fixed pages, collections, published content pages, policies, articles, and every published product with its photos and last change |
| Products | Own title, description (160 characters), one canonical address for all variants, share photo; `Product` with an `Offer` per priced variant (INR; out of stock while it cannot be bought) and `BreadcrumbList`. No `Product` block when nothing is priced. A failed catalogue read still says noindex |
| Collections | Canonical without sort or filter parameters; later pages keep `?page=N` |
| Articles | Description, publish date, cover; `Article` and `BreadcrumbList` |

## At launch

1. Set `SEO_INDEXING=on`, restart the web process, check `/robots.txt`.
2. Add the store to Google Search Console and Bing Webmaster Tools and submit `/sitemap.xml`.
3. Map old Shopify addresses to the new ones with permanent redirects.
4. Check product pages with Google's Rich Results Test.
