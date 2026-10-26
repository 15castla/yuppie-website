// Every preview screen, gathered. One file per area, each owned by its builder
// (never edit another area's file). shell-demo.tsx is the foundation's.

import { discountsScreens } from "./discounts";
import { eventsScreens } from "./events";
import { inviteScreens } from "./invite";
import { messagesScreens } from "./messages";
import { shellDemoScreens } from "./shell-demo";
import type { PreviewScreen } from "./types";
import { youScreens } from "./you";

export const PREVIEW_SCREENS: PreviewScreen[] = [
  ...shellDemoScreens,
  ...eventsScreens,
  ...discountsScreens,
  ...youScreens,
  ...inviteScreens,
  ...messagesScreens,
];

export function findScreen(id: string): PreviewScreen | undefined {
  return PREVIEW_SCREENS.find((screen) => screen.id === id);
}
