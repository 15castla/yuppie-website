// The community rules' text (3 Nov 2026, for the App Store: Apple's guideline 1.2 asks apps where members post and
// chat to have them agree to terms with no tolerance for objectionable content or abusive users, with report and
// block, and the club acting on reports within 24 hours). One text for both places it shows: the rules gate every
// member agrees to once (app/members/rules) and its permanent copy in Help (app/members/you/help/rules).

import { CONTACT_EMAIL } from "./links";

export type RuleSection = { heading: string; paragraphs: string[] };

export const RULES_INTRO =
  "Club Yuppie is for meeting people and doing things together. These rules cover everything members post and say: Open Invites, messages and questions.";

export const RULE_SECTIONS: RuleSection[] = [
  {
    heading: "Be decent",
    paragraphs: [
      "Treat other members the way you’d want to be treated. No harassment, bullying, threats, hate or discrimination, about anyone.",
    ],
  },
  {
    heading: "Keep it clean",
    paragraphs: [
      "No sexual content, violence, illegal activity, drugs, or anything that puts someone at risk.",
    ],
  },
  {
    heading: "Be who you say you are",
    paragraphs: ["Use your own name and photo. No fake accounts, spam, selling or promoting."],
  },
  {
    heading: "Keep plans real",
    paragraphs: [
      "Post plans you’ll actually go to, and say if you can’t make it. Meet somewhere public, and keep payments inside Club Yuppie.",
    ],
  },
  {
    heading: "Report and block",
    paragraphs: [
      "If someone breaks these rules, report the plan, the message or the member. You can also block a member, so they can’t contact you.",
    ],
  },
  {
    heading: "What we do",
    paragraphs: [
      "There’s zero tolerance for abusive members or objectionable content. We look at every report within 24 hours, take down anything that breaks these rules, and remove members who break them.",
      `Something urgent, or a question about these rules: ${CONTACT_EMAIL}. If anyone is in danger, call 999 first.`,
    ],
  },
];
