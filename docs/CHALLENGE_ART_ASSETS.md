# Challenge artwork

The challenge list keeps its compact 76 × 76 px thumbnails. Artwork is decorative; titles, reward amounts, and statuses remain the source of meaning. The existing covers for **Ask for AI Recommendations** and **Invite a Friend** remain unchanged. A failed or missing image falls back to the challenge's category icon.

## Photography and existing artwork

| Active challenge | Local asset | Creator and source |
|---|---|---|
| Choose Your Main Wish | `/challenges/main-wish-path.jpg` | [Sulthan Auliya, Unsplash](https://unsplash.com/photos/a-path-leading-to-the-top-of-a-mountain-WNDXky02ds4) |
| Personal Value Map | `/challenges/personal-value-notebook.jpg` | [Barney Goodman, Unsplash](https://unsplash.com/photos/a-lit-desk-lamp-illuminates-a-notebook-and-pen-LOk7sNVCNJU) |
| Team Welcome | `/challenges/team-welcome-hands.jpg` | [Clay Banks, Unsplash](https://unsplash.com/photos/five-human-hands-on-brown-surface-LjqARJaJotc) |
| Reach Today Core Target | `/core/core-reactor-pearl.webp` | Existing project artwork |

The three photos are stored locally as optimized 384 × 384 JPEGs. Each source page labels its photo free under the [Unsplash License](https://unsplash.com/license). The direct source links above preserve attribution and provenance.

## Generated miniature objects

The following transparent 320 × 320 PNGs were generated with the built-in image generation tool. The common prompt was a single centered, premium contemporary crafted object with champagne-gold material, restrained teal highlights, soft dimensional lighting, a clear silhouette at 76 px, and genuine transparent alpha. Every prompt excluded people, scenery, text, numbers, currency symbols, chests, confetti, and any claim of completion or reward.

| Challenge | Asset | Subject prompt |
|---|---|---|
| Today | `/challenges/today-medallion.png` | Solar medallion with a warm sunrise enamel center |
| Build Your Growth Plan | `/challenges/growth-plan-astrolabe.png` | Miniature brass astrolabe with a clear pointer and teal inner glow |
| Publish Your First Result | `/challenges/first-result-prism.png` | Faceted glass prism containing a small rising golden light |
| Calculate the Value of Your Attention | `/challenges/attention-hourglass.png` | Small glass hourglass with a few glowing amber grains |
| Skill Passport | `/challenges/skill-gem-key.png` | Short elegant key with a luminous blue-green gemstone |

The catalog-backed covers are assigned by `20260913164832_challenge_art_covers.sql` to the selected active rows only. Today is a separate featured item and uses its local asset directly. Other challenges continue to use category-specific icon fallbacks.

Status 2026-09-13: the migration is present in linked remote history. The public `/api/challenges` endpoint returned HTTP 200 with eight new cover paths and the two unchanged original paths; all nine local image paths returned HTTP 200 on the public site. TypeScript, lint, and production build passed with existing image and autoprefixer warnings. The one 390 px Playwright run remained in onboarding, so the actual Challenges layout still needs mobile User QA.
