import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** The photograph and its words on the left of each sign-in page: Figma 392:1652 (login) and 392:1697 (sign-up). */
const editorials = {
  login: {
    photo: "/media/account/login-editorial.webp",
    kicker: "Welcome home",
    title: ["Good living", "begins at home."],
    lead: ["Thoughtful furniture. Quiet details.", "A little more room to be yourself."],
  },
  "sign-up": {
    photo: "/media/account/sign-up-editorial.webp",
    kicker: "Make it yours",
    title: ["A home.", "A feeling.", "Entirely you."],
    lead: ["A personal space for your pieces,", "your plans and what comes next."],
  },
} as const;
export type AuthEditorial = keyof typeof editorials;

const lines = (parts: readonly string[]) =>
  parts.map((part, index) => (
    <span key={part} className="auth-line">
      {part}
      {index < parts.length - 1 ? " " : null}
    </span>
  ));

/**
 * A sign-in page's frame (Figma 392:1652 and 392:1697): the form panel with the logo, the form and a quiet footer, beside
 * the editorial photograph (780 of 1440; a band above the form on phones). These pages wear no store header: the logo and
 * "Back to shop" lead home. The form comes first in the page's order; the photograph only illustrates it.
 */
export function AuthShell({ editorial, aside, children }: { editorial: AuthEditorial; aside: ReactNode; children: ReactNode }) {
  const art = editorials[editorial];
  return (
    <div className="account auth" data-store data-auth={editorial}>
      <main id="main" className="auth-panel">
        <div className="auth-brand">
          <Link href="/" className="auth-logo" aria-label="Maple Furnishers home">
            {/* The site header's logo file, as the checkout's minimal header paints it. */}
            <Image src="/media/footer/maple-logo.webp" width={1080} height={500} alt="Maple Furnishers" unoptimized />
          </Link>
        </div>
        <div className="auth-body">{children}</div>
        <div className="auth-aside">
          <hr className="auth-rule" />
          {aside}
          <p className="auth-footer-links">
            <Link href="/">← Back to shop</Link>
            <span>
              <Link href="/policies/privacy-policy">Privacy</Link> · <Link href="/contact">Help</Link>
            </span>
          </p>
        </div>
      </main>
      <div className="auth-editorial">
        <div className="auth-editorial-media">
          <Image className="auth-editorial-photo" src={art.photo} alt="" fill sizes="(max-width: 959px) 100vw, 54vw" preload />
        </div>
        <p className="auth-kicker">Maple Furnishers&nbsp;&nbsp;/&nbsp;&nbsp;The art of living</p>
        <div className="auth-caption">
          <p className="auth-kicker">{art.kicker}</p>
          <p className="auth-editorial-title">{lines(art.title)}</p>
          <p className="auth-editorial-lead">{lines(art.lead)}</p>
          <p className="auth-kicker" data-signature="">Nimbus collection&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;—&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Maple</p>
        </div>
      </div>
    </div>
  );
}
