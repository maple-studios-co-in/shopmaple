# Media provenance

No generated product imagery is used, with one exception: `home/hero-sofas.webp`, `hero-chairs.webp`, `hero-tables.webp` and `hero-beds.webp` are the four hero tile photos cropped from the raster in the owner's Figma frame "Maple / Impact Layout" (`nTEPXzov9IuWraGF0Ace6V`, node 1049:27808, raw image 1536 x 1024), with the tile title and link text painted out, enlarged 2x and saved as WebP on 1 November 2026. They are mock-up renders from the owner's design file, not Maple photographs; replace them in Template media when real tile photos exist.

Since 11 November 2026 the store loads nothing from Shopify (owner's decision): artwork that was only on Shopify is replaced by staff uploads, or stands in from Keeri product photos until then. The former workshop film copy (`workshop.mp4`, `workshop-poster.webp`) was unused and has been removed.

## Original footer assets

Copied unchanged on 26 October 2026 from assets already loaded by the original Shopify homepage, using the browser's asset export. These are the owner's original footer artwork, not generated replacements. The CDN returned WebP bytes for the PNG-named logo URL; its local extension reflects that response format.

| Local file | Original filename and public source |
| --- | --- |
| `footer/maple-logo.webp` | `Cover_Image_Maple_1.png` (former shop) |
| `footer/map.svg` | `Map.svg` (former shop) |
| `footer/phone.svg` | `Call.svg` (former shop) |
| `footer/mail.svg` | `Mail.svg` (former shop) |
| `footer/phone-light.svg` | `icon.svg` (former shop) |
| `footer/mail-light.svg` | `icon_2.svg` (former shop) |
| `footer/amazon.avif` | `amazon_logo.avif` (former shop) |

## Homepage motion assets (2 November 2026)

Added for the owner's homepage notes of 2 November 2026.

- `home/nimbus-terra.webp` (1600 px wide) and `home/nimbus-terra-mobile.webp` (900 px wide) are the Terra slide's photo from the owner's Figma file "Maple-Website-Review" (`GJsFInfhys0crdNpQsbUUU`, node 1:1069, raw image 1920 x 878), exported through the Figma connector and re-encoded as WebP. Like the hero tiles above, it is a mock-up render from the owner's design file, not a Maple photograph; replace it in the Nimbus slide editor when a real Terra photo exists.
- The editorial flipbook's pictures are Maple's own published product photos, resized to 800 x 800 (centre crop) and re-encoded as WebP:

| Local file | Product | Public source |
| --- | --- | --- |
| `home/editorial-flip-runo.webp` | Runo Dining Table | `File_2026-05-27T10_42_35.368Z.webp` (former shop) |
| `home/editorial-flip-aero.webp` | Aero Dining Chair | `Frame174.png` (former shop) |
| `home/editorial-flip-varyn.webp` | Varyn Dining Table | `File_2026-05-27T11_29_17.560Z.webp` (former shop) |
| `home/editorial-flip-seno.webp` | Seno Dining Table | `File_2026-05-27T11_09_10.656Z.webp` (former shop) |

## Our Story (10 November 2026)

From the owner's Figma file "Maple Website Review" (`GJsFInfhys0crdNpQsbUUU`), page node 293:1093 and its journey slider 293:1434, exported through the Figma connector on 10 November 2026:

- `our-story/chapter-1.webp` to `chapter-7.webp`: the slider's seven editorial images (raw images 1024 x 1024 PNG), re-encoded as WebP at the same size. Like the homepage hero tiles, they are mock-up renders from the design file, not Maple photographs; replace them under Artwork, Our Story, when real ones exist.
- `our-story/handmade.svg`, `unique-designs.svg`, `bespoke-pieces.svg`: the principles' line drawings; `previous.svg`, `next.svg` and `journey-dot.svg`: the slider's chevrons and year marker. Unchanged SVG exports.

The opening and belief photos were Shopify files and are no longer loaded; until staff upload their own, the page shows Keeri product photos.

## Blog article pictures, sharpened (10 November 2026)

`/blog/art/<article>.webp` (in `apps/web/public/blog/art/`) are seven imported articles’ own pictures from the former shop, which are only 482px wide. Each was enlarged four times with ESRGAN (the `@upscalerjs/esrgan-thick` 1.0.0 4x model, run locally in the browser) and saved at 1600px wide, so the article’s 1200px banner is sharp. The three articles whose pictures were already 1536px wide used them from Shopify; since 11 November 2026 they show Maple's own room photos from `home/` instead.

## Bulk Enquiry (10 November 2026)

From the owner's Figma file "Maple Website Review" (`GJsFInfhys0crdNpQsbUUU`), page node 298:924, exported through the Figma connector on 10 November 2026:

- `bulk-enquiry/hero.webp`: the opening's lounge (raw image 1619 x 972 PNG); `step-meet.webp`, `step-design.webp`, `step-deliver.webp`: the three steps' photos (raw images 1254 x 1254 JPEG); `proposal.webp`: the material samples beside the form (raw image 1280 x 1024). Re-encoded as WebP at the same sizes. Like the Our Story chapters, they are mock-up renders from the design file, not Maple photographs; replace them under Artwork, Bulk Enquiry, when real ones exist.
- `bulk-enquiry/ruler.svg`, `layers.svg`, `shield.svg`, `truck.svg`, `upload.svg`: the design's line icons, unchanged SVG exports. `tag.svg` is drawn to match them, for a price promise kept from the original template.

## Contact (10 November 2026)

From the owner's Figma file "Maple Website Review" (`GJsFInfhys0crdNpQsbUUU`), frame 298:511 "Maple / Contact / Desktop", exported through the Figma connector on 10 November 2026:

- `contact/studio.webp`: the opening's consultation studio (node 298:549, raw image 1792 x 768 PNG); `contact/workshop.webp`: the Delhi address's wood finishing (node 298:667, raw image 1536 x 1024 PNG). Re-encoded as WebP at the same sizes. Like the Our Story chapters, they are mock-up renders from the design file, not Maple photographs; replace them under Artwork, Contact, when real ones exist.
- `contact/phone.svg`, `mail.svg`, `pin.svg` (the ways to reach us) and `truck.svg`, `receipt.svg`, `user.svg`, `shield.svg`, `box.svg` (the help centre's topics): the design's line icons, unchanged SVG exports.
