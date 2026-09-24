// Saved materials are available by default after the schema rollout. Set this
// public build-time flag to "false" only for an emergency pause.
export const SHARE_TO_OA_ENABLED = process.env.NEXT_PUBLIC_SHARE_TO_OA_ENABLED !== "false";
