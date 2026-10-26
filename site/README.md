# Salted website

Standalone, buildless GitHub Pages marketing site. The full Expo application remains in `app/`.

## Preview

From the repository root run `node site/serve.mjs`, then visit http://127.0.0.1:4173.

## Publish

In the GitHub repository, open Settings → Pages and select **GitHub Actions** as the source. Commit and push `site/` and `.github/workflows/pages.yml` to `main`, or manually run the **Deploy Salted website to GitHub Pages** workflow. The deployment step reports the actual published URL. The workflow publishes only this directory; it does not publish app configuration or environment files.

Assets use relative paths, so both repository subpaths and custom domains work. No runtime dependencies, analytics or external fonts are loaded. The meal planner uses temporary sample state only; it does not connect to Supabase. Grocery quantities are illustrative and omit pantry staples. Copying a message requires clipboard permission; when unavailable, the message is selected for manual copying.

## Design and assets

Street-poster typography, tomato orange, the existing brand’s warm paper base and butter-yellow household posters. Figtree is self-hosted under the SIL Open Font License in `assets/OFL.txt`. Buttons use 6px corners, panels 12px corners, and household selectors are pills. Motion uses CSS entry transitions and an IntersectionObserver, with reduced-motion support.

`assets/shared-table.png` was generated with the built-in image generation tool. Prompt: “Photorealistic editorial overhead photograph of a shared Indian dinner on a terracotta orange table: dal, paneer curry, rice, rotis, cucumber salad and lime, three young adults’ hands sharing food, no faces; warm direct evening sunlight, food-magazine styling, tomato red and butter yellow palette, no text or logos.”

Verification should cover desktop/mobile overflow, household selectors, all three meals, attendance bounds (1–12), matching quantities and cook messages, clipboard success/fallback, FAQ disclosures and reduced motion.
