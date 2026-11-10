# Media provenance

workshop.mp4 and workshop-poster.webp derive from Maple's currently published Shopify homepage video:
https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/756c69d84abb4904895cd9b52af85e20/756c69d84abb4904895cd9b52af85e20.HD-1080p-7.2Mbps-84649651.mp4?v=0

Retrieved 25 October 2026 for the owner's requested storefront migration. Video is a silent 12-second, 960px-wide H.264 derivative; poster is a frame at 1 second encoded as WebP. No generated product imagery is used, with one exception: `home/hero-sofas.webp`, `hero-chairs.webp`, `hero-tables.webp` and `hero-beds.webp` are the four hero tile photos cropped from the raster in the owner's Figma frame "Maple / Impact Layout" (`nTEPXzov9IuWraGF0Ace6V`, node 1049:27808, raw image 1536 x 1024), with the tile title and link text painted out, enlarged 2x and saved as WebP on 1 November 2026. They are mock-up renders from the owner's design file, not Maple photographs; replace them in Template media when real tile photos exist.

Other current storefront images remain referenced at their original Shopify CDN URLs during the preview. R2 migration is not yet implemented.

## Original footer assets

Copied unchanged on 26 October 2026 from assets already loaded by the original Shopify homepage, using the browser's asset export. These are the owner's original footer artwork, not generated replacements. The CDN returned WebP bytes for the PNG-named logo URL; its local extension reflects that response format.

| Local file | Original filename and public source |
| --- | --- |
| `footer/maple-logo.webp` | [Cover_Image_Maple_1.png](https://shop.maplefurnishers.com/cdn/shop/files/Cover_Image_Maple_1.png?v=1752647999&width=2560) |
| `footer/map.svg` | [Map.svg](https://shop.maplefurnishers.com/cdn/shop/files/Map.svg?v=1775835164&width=1200) |
| `footer/phone.svg` | [Call.svg](https://shop.maplefurnishers.com/cdn/shop/files/Call.svg?v=1775834818&width=1200) |
| `footer/mail.svg` | [Mail.svg](https://shop.maplefurnishers.com/cdn/shop/files/Mail.svg?v=1775835046&width=1200) |
| `footer/phone-light.svg` | [icon.svg](https://shop.maplefurnishers.com/cdn/shop/files/icon.svg?v=1779434063&width=1200) |
| `footer/mail-light.svg` | [icon_2.svg](https://shop.maplefurnishers.com/cdn/shop/files/icon_2.svg?v=1779434063&width=1200) |
| `footer/amazon.avif` | [amazon_logo.avif](https://shop.maplefurnishers.com/cdn/shop/files/amazon_logo.avif?v=1778615085&width=1200) |

## Homepage motion assets (2 November 2026)

Added for the owner's homepage notes of 2 November 2026.

- `home/nimbus-terra.webp` (1600 px wide) and `home/nimbus-terra-mobile.webp` (900 px wide) are the Terra slide's photo from the owner's Figma file "Maple-Website-Review" (`GJsFInfhys0crdNpQsbUUU`, node 1:1069, raw image 1920 x 878), exported through the Figma connector and re-encoded as WebP. Like the hero tiles above, it is a mock-up render from the owner's design file, not a Maple photograph; replace it in the Nimbus slide editor when a real Terra photo exists.
- The editorial flipbook's pictures are Maple's own published product photos, resized to 800 x 800 (centre crop) and re-encoded as WebP:

| Local file | Product | Public source |
| --- | --- | --- |
| `home/editorial-flip-arden.webp` | Arden Console Cabinet | [9D25AA03-….webp](https://cdn.shopify.com/s/files/1/0691/8651/9229/files/9D25AA03-9581-46B1-B8BC-749AE7B9A95C.webp?v=1781938509) |
| `home/editorial-flip-runo.webp` | Runo Dining Table | [File_2026-05-27T10_42_35.368Z.webp](https://cdn.shopify.com/s/files/1/0691/8651/9229/files/File_2026-05-27T10_42_35.368Z.webp?v=1780469859) |
| `home/editorial-flip-aero.webp` | Aero Dining Chair | [Frame174.png](https://cdn.shopify.com/s/files/1/0691/8651/9229/files/Frame174.png?v=1777655455) |
| `home/editorial-flip-varyn.webp` | Varyn Dining Table | [File_2026-05-27T11_29_17.560Z.webp](https://cdn.shopify.com/s/files/1/0691/8651/9229/files/File_2026-05-27T11_29_17.560Z.webp?v=1780471840) |
| `home/editorial-flip-seno.webp` | Seno Dining Table | [File_2026-05-27T11_09_10.656Z.webp](https://cdn.shopify.com/s/files/1/0691/8651/9229/files/File_2026-05-27T11_09_10.656Z.webp?v=1780470231) |

## Our Story (10 November 2026)

From the owner's Figma file "Maple Website Review" (`GJsFInfhys0crdNpQsbUUU`), page node 293:1093 and its journey slider 293:1434, exported through the Figma connector on 10 November 2026:

- `our-story/chapter-1.webp` to `chapter-7.webp`: the slider's seven editorial images (raw images 1024 x 1024 PNG), re-encoded as WebP at the same size. Like the homepage hero tiles, they are mock-up renders from the design file, not Maple photographs; replace them under Artwork, Our Story, when real ones exist.
- `our-story/handmade.svg`, `unique-designs.svg`, `bespoke-pieces.svg`: the principles' line drawings; `previous.svg`, `next.svg` and `journey-dot.svg`: the slider's chevrons and year marker. Unchanged SVG exports.

The opening and belief photos are Maple's own, still referenced at their Shopify CDN addresses (`Frame129.png` and the workshop film's poster frame).

## Blog article pictures, sharpened (10 November 2026)

`/blog/art/<article>.webp` (in `apps/web/public/blog/art/`) are seven imported articles’ own pictures from Shopify (`shop.maplefurnishers.com/cdn/shop/articles/…`), which are only 482px wide. Each was enlarged four times with ESRGAN (the `@upscalerjs/esrgan-thick` 1.0.0 4x model, run locally in the browser) and saved at 1600px wide, so the article’s 1200px banner is sharp. The three articles whose pictures were already 1536px wide keep their Shopify addresses.
