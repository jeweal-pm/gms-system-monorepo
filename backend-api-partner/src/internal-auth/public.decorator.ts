import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ROUTE = "partner:public-route";

/** Only `/health/*` is public; those routes return no data (authorization.md). */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
