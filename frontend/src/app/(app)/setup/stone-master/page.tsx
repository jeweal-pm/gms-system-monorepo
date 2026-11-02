import { redirect } from "next/navigation";
import { DEFAULT_STONE_SLUG, stonePageHref } from "@/features/stone-master/kinds";

/** `/setup/stone-master` opens the first page, Stone Group (stone-master ui-spec "Pages and routes"). */
export default function StoneMasterIndex() {
  redirect(stonePageHref(DEFAULT_STONE_SLUG));
}
