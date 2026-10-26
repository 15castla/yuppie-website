// The members kit: presentational building blocks ported from the approved
// designs (k2.py / kit2.css). Import from "@/components/members/kit".
// Pure components of props: no fetching, no cookies(), no server actions, so
// the preview harness can render any page built from them.

export { Avatar, AvatarStack, initialOf, type AvatarStackItem, type AvatarTone } from "./avatar";
export { BackLink, BackRow } from "./back-row";
export { Button, buttonClass, type ButtonProps, type ButtonVariant } from "./button";
export { Card, Tile, type CardTone } from "./card";
export { Chip, ChipRow } from "./chips";
export { ClosingBand } from "./closing-band";
export { cssVars } from "./css-vars";
export { PerkDrawing, TrainerDrawing, type PerkDrawingName } from "./drawings";
export { EmptyState } from "./empty-state";
export { EXAMPLE_WORDS, ExampleNote, ExampleScope, useExample } from "./example-note";
export { FormField, FormTextarea } from "./form-field";
export { Icon, ICON_NAMES, type IconName } from "./icons";
export { KitLink, type KitLinkProps } from "./link";
export { LoadingShapes, RowShape, Shape } from "./loading-shapes";
export { Main } from "./main";
export { Pill, Status, type PillKind } from "./pill";
export { DateColumn, Row, Rows } from "./row";
export { SectionHead, SectionTitle } from "./section-head";
export { Segmented, type SegmentedItem } from "./segmented";
export { Serif, TitleBlock } from "./title-block";
