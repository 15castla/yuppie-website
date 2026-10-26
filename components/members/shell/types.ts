// Shared shell types. No React, no next/*: safe in server and client code.

export type ShellMode = "web" | "app";

// What the shell shows of the signed-in member: your photo top right and, on
// a computer, your first name beside it.
export type MemberSummary = {
  /** May be empty (a member with no name on file): the header then shows no name. */
  firstName: string;
  /** The member's photo, or null: the shell draws their initial in an ink circle. */
  photoUrl: string | null;
};
