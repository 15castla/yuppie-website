"use client";

// FAQs: two groups of ruled question rows with a plus or minus in a 36px
// disc, one open at a time, and a "Still stuck?" card (a rail card on a
// computer, a block at the foot on a phone). The answers are the public
// site's own (lib/members/you/help.ts).

import "./you.css";

import { useId, useState } from "react";

import { Button, Card, Icon, Main } from "@/components/members/kit";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/members/routes";
import type { HelpFaqGroup } from "@/lib/members/you/help";
import { SubPageHead } from "./you-parts";

function StuckCard() {
  return (
    <Card className="yu-stuck">
      <h2 className="mk-h2">Still stuck?</h2>
      <p>Email us and we’ll help.</p>
      <Button size="sm" href={ROUTES.youHelpContact}>
        Contact us
      </Button>
    </Card>
  );
}

export function FaqView({ groups, initialOpen }: { groups: HelpFaqGroup[]; initialOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(initialOpen === undefined ? (groups[0]?.items[0]?.id ?? null) : initialOpen);
  const base = useId();

  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="FAQs." sub="Answers to the usual questions." />
      <div className="mk-wrap">
        <div className="mk-cols yu-help-cols">
          <div className="yu-faq-col">
            {groups.map((group) => (
              <div className="yu-faq-group" key={group.label}>
                <h2 className="mk-term">{group.label}</h2>
                <div className="yu-faqs">
                  {group.items.map((item) => {
                    const isOpen = open === item.id;
                    const buttonId = `${base}-q-${item.id}`;
                    const panelId = `${base}-a-${item.id}`;
                    return (
                      <div className={cn("yu-faq", isOpen && "yu-open")} key={item.id}>
                        <h3>
                          <button
                            type="button"
                            id={buttonId}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => setOpen(isOpen ? null : item.id)}
                          >
                            <span className="yu-q">{item.question}</span>
                            <span className="yu-t">
                              <Icon name={isOpen ? "minus" : "plus"} size={18} />
                            </span>
                          </button>
                        </h3>
                        {isOpen ? (
                          <div className="yu-a" role="region" id={panelId} aria-labelledby={buttonId}>
                            <p>{item.answer}</p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <aside className="mk-rail mk-show-desk yu-help-rail">
            <StuckCard />
          </aside>
        </div>
        <div className="mk-show-phone yu-stuck-phone">
          <StuckCard />
        </div>
      </div>
    </Main>
  );
}
