// Kit counterpart: k2.wordmark(). The Club Yuppie wordmark as the public
// header draws it (next/image, the same file), 30px high in the phone bar,
// 46px on a computer (the CSS sets the height; sizes lets the optimiser serve
// a small file). It links to the landing page.

import Image from "next/image";

import { KitLink } from "../kit/link";
import { landingPath } from "@/lib/members/routes";

export function Wordmark({ href }: { href?: string }) {
  return (
    <KitLink href={href ?? landingPath()} className="mk-wm-link">
      <Image
        src="/yuppie_logo_forte_forward.png"
        alt="Club Yuppie"
        width={1942}
        height={641}
        sizes="(min-width: 768px) 140px, 92px"
        loading="eager"
        className="mk-wm"
      />
    </KitLink>
  );
}
