import Link from "next/link";
import { contentImageSchema, contentLinkSchema, type AuthoredBlock } from "@shopmaple/contracts";
import { isPrivatePreviewMedia } from "@/lib/preview-media";

/** Shared semantic body for published articles and the unsaved editor preview. */
export function AuthoredArticleBody({ blocks, preview = false }: { blocks: readonly AuthoredBlock[]; preview?: boolean }) {
  return <>{blocks.map(block => {
    switch (block.type) {
      case "paragraph": return <p key={block.id}>{block.text}</p>;
      case "heading": return block.level === 3 ? <h3 key={block.id}>{block.text}</h3> : <h2 key={block.id}>{block.text}</h2>;
      case "quote": return <blockquote key={block.id}>{block.text}</blockquote>;
      case "list": {
        const List = block.ordered ? "ol" : "ul";
        return <List key={block.id}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</List>;
      }
      case "link": return <p key={block.id}>{contentLinkSchema.safeParse(block.href).success ? <Link href={block.href}>{block.text}</Link> : block.text}</p>;
      case "image": {
        // Draft previews already map private uploads to the staff media path.
        if (!contentImageSchema.safeParse(block.src).success && !isPrivatePreviewMedia(block.src)) return null;
        const managed = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/.exec(block.src);
        if (block.src.startsWith("/media/uploads/") && !managed) return null;
        const src = preview && managed ? `/api/admin/media/${managed[1]}/preview` : block.src;
        return <img key={block.id} src={src} alt={block.alt} width={1200} height={800} loading="lazy" style={{ display: "block", width: "100%", height: "auto", aspectRatio: "3 / 2", objectFit: "contain" }} />;
      }
    }
  })}</>;
}
