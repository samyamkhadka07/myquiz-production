export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_npr: number;
  duration_days: number | null;
  features: string[];
  ai_daily_limit: number;
  marketing_text: string;
  display_order: number;
  recommended: boolean;
  enabled: boolean;
  archived_at: string | null;
  version: number;
};

export type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  qr_object_path: string | null;
  qr_url?: string | null;
  display_name: string | null;
  instructions: string | null;
  account_identifier: string | null;
  verification_instructions: string | null;
  display_order: number;
};

export function featureLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
