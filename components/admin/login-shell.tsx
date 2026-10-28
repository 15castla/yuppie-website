// The admin Log in and password pages' frame (r2b 13): the black band with just ADMIN (nobody is logged in
// yet), the wordmark, and the pale card with the hard shadow.

import Image from "next/image";
import type { ReactNode } from "react";

import { Icon } from "./icons";

export function LoginShell({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="ad-band">
        <div className="ad-wrap">
          <span className="l">Admin</span>
        </div>
      </div>
      <main className="ad-lmain">
        <div className="ad-wrap">
          <div className="ad-lwm">
            <Image src="/yuppie_logo_forte_forward.png" alt="Club Yuppie" width={1942} height={641} sizes="110px" priority className="ad-wm" />
          </div>
          <div className="ad-lcard">
            <h1 className="ad-h1">{title}</h1>
            <p className="ad-lead">{lead}</p>
            <div className="ad-lform">{children}</div>
          </div>
        </div>
      </main>
    </>
  );
}

/** One plain message under the fields: an error (red) or a notice (a green tick). */
export function LoginMessage({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (error) {
    return (
      <p className="ad-lmsg err" role="alert">
        <Icon name="circle-alert" size={18} />
        <span>{error}</span>
      </p>
    );
  }
  if (notice) {
    return (
      <p className="ad-lmsg" role="status">
        <Icon name="circle-check" size={18} />
        <span>{notice}</span>
      </p>
    );
  }
  return null;
}
