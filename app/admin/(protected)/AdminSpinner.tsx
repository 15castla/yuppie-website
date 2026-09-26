// Same spinner as app/members/loading.tsx, for visual consistency between
// the admin portal and the members area. Just fills a reasonable
// min-height rather than the full page: admin routes already get their
// chrome, nav, and padding from this route group's layout.tsx.
export default function AdminSpinner() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
    </div>
  );
}
