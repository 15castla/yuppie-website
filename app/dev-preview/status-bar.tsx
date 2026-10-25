// Preview furniture, never part of the product: the phone's status area and
// home indicator, drawn over the page in app mode on a phone-width screen, so
// a shot of the app shell can be laid beside the approved mockup. The real app
// has the system's own. Hidden with ?device=0. Copied from the mockup kit
// (k2.statusbar()).

export function StatusBarMock() {
  return (
    <>
      <div className="pv-statusbar" aria-hidden="true">
        <span>09:41</span>
        <span className="pv-island" />
        <span className="pv-glyphs">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="#1B1512">
            <rect x="0" y="8" width="3" height="4" rx="1" />
            <rect x="5" y="5" width="3" height="7" rx="1" />
            <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
            <rect x="15" y="0" width="3" height="12" rx="1" />
          </svg>
          <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="#1B1512" strokeWidth="2" strokeLinecap="round">
            <path d="M1.5 4.2a10 10 0 0 1 14 0" />
            <path d="M4 7a6.5 6.5 0 0 1 9 0" />
            <circle cx="8.5" cy="10" r="1" fill="#1B1512" stroke="none" />
          </svg>
          <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
            <rect x=".75" y=".75" width="22" height="11.5" rx="3.5" stroke="#1B1512" strokeWidth="1.5" opacity=".5" />
            <rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="#1B1512" />
            <path d="M25 4.5v4" stroke="#1B1512" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
          </svg>
        </span>
      </div>
      <div className="pv-home-ind" aria-hidden="true" />
    </>
  );
}
