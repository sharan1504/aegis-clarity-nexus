import { createServerFn } from "@tanstack/react-start";
import { completeWorkdayOAuth } from "./oauth-workday.server";

export const completeWorkdayConnection = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeWorkdayOAuth(data.state, data.code));
