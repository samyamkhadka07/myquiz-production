import { redirect } from "next/navigation";

/** Document extraction is no longer an active product workflow. */
export default function Page() { redirect("/admin/contributions"); }
