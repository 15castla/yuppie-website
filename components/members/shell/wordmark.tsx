// Kit counterpart: k2.wordmark(). The Club Yuppie wordmark as the public
// header draws it (next/image, the same file), 30px high in the phone bar,
// 46px on a computer (the CSS sets the height; sizes lets the optimiser serve
// a small file). It links to /members, which goes to the landing page for this shell (the web's, or the app's
// with its own Open Invite switch).

import Image from "next/image";

import { KitLink } from "../kit/link";
import { ROUTES } from "@/lib/members/routes";

export function Wordmark({ href }: { href?: string }) {
  return (
    <KitLink href={href ?? ROUTES.root} className="mk-wm-link">
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
