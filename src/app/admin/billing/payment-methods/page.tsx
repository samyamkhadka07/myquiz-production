import { admin, requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { PaymentMethodEditor } from "@/components/admin-billing";
import type { PaymentMethod } from "@/lib/billing";
export default async function Page() {
  const { db, profile } = await requirePage(true);
  admin(profile);
  const methods = check(
    await db.from("payment_methods").select("*").order("display_order"),
  ) as PaymentMethod[];
  return (
    <>
      <p className="eyebrow">Billing configuration</p>
      <h1>Payment methods</h1>
      <p>
        Methods remain disabled until real owner-supplied payment details and QR assets are
        configured.
      </p>
      <div className="admin-card-grid">
        {methods.map((method) => (
          <PaymentMethodEditor method={method} key={method.id} />
        ))}
      </div>
    </>
  );
}
