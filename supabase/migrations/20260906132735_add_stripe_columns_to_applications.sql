-- Stripe fields for applications: customer + payment method are set when
-- someone applies and their card is saved via a SetupIntent (no charge
-- yet); subscription id is set once the committee approves them and a
-- recurring Subscription is successfully created; payment_error stores
-- the last error message if a charge attempt at approval time fails, so
-- the admin applications view can show why an approval didn't go through.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_error text;
