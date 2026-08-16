"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 bg-background px-6 py-24 text-center text-foreground sm:gap-12">
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          <Image
            src="/yuppie_wordmark_clean_transparent.png"
            alt="Yuppie"
            width={1471}
            height={507}
            priority
            className="h-auto w-[85vw] max-w-[900px]"
          />
        </motion.div>

        <p className="max-w-md text-lg text-foreground/70 sm:text-xl">
          Your Social Life, Curated
        </p>
      </div>

      <a
        href="/apply"
        className="rounded-full border-2 border-foreground bg-foreground px-10 py-4 text-base font-semibold tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground sm:px-12 sm:py-5 sm:text-lg"
      >
        Apply
      </a>
    </main>
  );
}
