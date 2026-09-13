export default function EventDetailLoading() {
  return (
    <>
      <main className="relative z-10 flex min-h-dvh flex-1 items-center justify-center px-4 pt-8 pb-[130px] sm:px-6 md:pt-28 md:pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </main>

      <div
        aria-hidden
        className="fixed left-3.5 right-3.5 bottom-3.5 z-20 h-16 rounded-[26px] bg-cream shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)] md:hidden"
      />
    </>
  );
}
