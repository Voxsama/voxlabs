import { currentUser, userCount } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { authDisabled } from "@/lib/session";

/** Who am I? Also tells the login page whether the first admin still needs to be created. */
export const GET = handle(
  async (req: Request) => {
    const user = currentUser(req);
    return json({ user, needsSetup: !authDisabled() && userCount() === 0, authDisabled: authDisabled() }, user ? 200 : 401);
  },
  { public: true },
);
