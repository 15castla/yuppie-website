import ApplyForm from "./apply-form";
import { createCardSetupIntent } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const result = await createCardSetupIntent();

  return (
    <ApplyForm
      clientSecret={result.success ? result.clientSecret : null}
      setupError={result.success ? null : result.error}
    />
  );
}
