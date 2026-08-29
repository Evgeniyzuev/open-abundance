# App Testing challenge and public project reviews

Status: implemented 2026-07-24.

## User route

After accepting `Test Open Abundance`, the challenge detail becomes a resumable six-section beta route:

1. install the PWA on iOS or Android and open it from the home-screen shortcut;
2. test Home and Today;
3. test Goals, notes, Checks, Map and Results;
4. ask one meaningful question in Ideas / AI;
5. inspect Wallet, Core, Market and the calculator without making a real transaction;
6. inspect Feed, a user profile, Blog and Teams.

The install section uses local UI diagrams. Desktop users also see a QR code that opens the current application URL on a phone. Each section records an outcome, a 1–5 rating and an optional comment; the comment becomes required for `partly`, `failed` and `unclear`.

The draft is written to `localStorage` immediately and to the authenticated, `no-store` API after a short debounce. The API draft is the cross-device source of truth, while the local copy protects recent input during a temporary connection failure. Publication consent is deliberately never persisted as a draft.

## Submission and reward

The final step collects the overall technical assessment, mission assessment, project clarity rating, attitude, strengths, concerns and a separate public review. The user sees the exact public card and must explicitly consent to publish it from the current profile.

**Extension 2026-08-29 (project clarity):** the survey adds a required 1–5 rating "How clear is what Open Abundance is?" (`projectClarityRating`). It is stored privately in `challenge_feedback_submissions.project_clarity_rating` and is not exposed in public review metadata. "What seemed strange or suspicious" remains covered by the existing `main_concern` choice plus the private technical comment, so no duplicate field was added. Migration: `supabase/migrations/20260829130000_app_testing_project_clarity.sql` (adds the column and recreates `submit_app_testing_feedback` with the new parameter).

`submit_app_testing_feedback(...)` performs the final operation in one database transaction:

- validates all six sections and final answers;
- saves the private submission as submitted;
- creates one published `feed_posts.post_type = 'project_review'`;
- creates its public metadata;
- completes the challenge and awards `Core +3$` once.

The RPC is idempotent per `(user_id, challenge_id)`. A repeated request returns the existing submission/post and does not award Core again. Negative ratings and skeptical attitudes pass the same validation as positive feedback.

## Data boundaries

Private beta data lives in `challenge_feedback_submissions`. Direct client access is revoked; only authenticated server APIs using the service role load or change a user's own row. This table contains section answers, device context, error descriptions, technical comments and the recorded consent version/time.

Public review text lives in `feed_posts.body`. `feed_project_review_metadata` contains only the overall rating, mission rating, attitude, most useful area and the challenge reward disclosure. Feed payloads never join or return the private submission.

Deleting a review soft-deletes only the feed post. Editing changes only the public body and metadata. The private submission and completed reward remain intact.

## Public Feed

`People → Feed` has server-backed `All` and `Reviews` filters. The reviews view uses timestamp cursor pagination and shows count, average rating and the 5-to-1-star distribution across all currently published, public, non-deleted project reviews.

The card and detail view show the author, stars, mission score, attitude, useful area and `Review from challenge participation · Core +3$`. Only the author can edit or delete the post.

## Primary implementation

- `components/AppTestingSurvey.tsx`
- `app/api/challenges/app-testing/route.ts`
- `lib/appTestingFeedback.ts`
- `app/api/social/feed/route.ts`
- `app/api/social/feed/posts/[postId]/route.ts`
- `components/SocialApp.tsx`
- `supabase/migrations/20260724235900_app_testing_feedback_reviews.sql`
