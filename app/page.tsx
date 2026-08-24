"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/Button";

const ENTRANCE_VARIANTS = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

const ENTRANCE_TRANSITION = { duration: 1.5, ease: "easeOut" as const };

export default function Home() {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    function reveal() {
      setShowButton(true);
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("click", reveal);
      window.removeEventListener("touchstart", reveal);
    }

    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("click", reveal);
    window.addEventListener("touchstart", reveal, { passive: true });

    return () => {
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("click", reveal);
      window.removeEventListener("touchstart", reveal);
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 bg-background px-6 py-24 text-center text-foreground sm:gap-12">
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={ENTRANCE_VARIANTS}
          transition={{ ...ENTRANCE_TRANSITION, delay: 0.3 }}
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt="Yuppie"
            width={1942}
            height={641}
            priority
            className="h-auto w-[85vw] max-w-[900px]"
          />
        </motion.div>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={ENTRANCE_VARIANTS}
          transition={{ ...ENTRANCE_TRANSITION, delay: 0.3 }}
          className="max-w-md text-lg text-foreground/70 sm:text-xl"
        >
          Too Fun to Stay Home
        </motion.p>
      </div>

      <motion.div
        initial="hidden"
        animate={showButton ? "visible" : "hidden"}
        variants={ENTRANCE_VARIANTS}
        transition={ENTRANCE_TRANSITION}
        style={{ pointerEvents: showButton ? "auto" : "none" }}
      >
        <Button href="/apply">Apply</Button>
      </motion.div>
    </main>
  );
}
