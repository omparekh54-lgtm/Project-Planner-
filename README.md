# Forma — idea to build

Forma turns a rough product idea into suggested improvements. Accept or pass each suggestion, choose a builder, and confirm once to generate a project plan and a series of build prompts. No further writing is required.

## Run locally

Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`.

Set `GEMINI_API_KEY` on the server to enable the shared AI connection. **Also set `APP_ACCESS_CODE`** to protect the public deployment from arbitrary consumption of your API quota. Alternatively, leave the server key unset and let each user enter their own Gemini key in the Settings dialog; browser-provided keys remain in tab memory and are sent only to the app's server endpoint, which relays requests to Google. Neither kind of secret belongs in git.

For accounts and cross-device cloud sync, create a separate Supabase project, apply `supabase/migrations/20260926000000_create_projects.sql`, and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Add your deployed URL to Supabase Auth redirect URLs and enable email sign-in. These two frontend values are public project identifiers; never use a Supabase secret or service role key in the browser. If these values are absent, Forma runs in single-browser local mode without accounts. Local drafts are not automatically uploaded when cloud sync is later enabled: export them first, sign in, and import each export.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`; change it to a model available to your key if needed.

## Deployment

Connect this GitHub repository to Vercel as a Next.js project. Set `GEMINI_API_KEY` and `APP_ACCESS_CODE` as server environment variables in the Vercel project settings, then redeploy. Do not prefix either with `NEXT_PUBLIC_`. Set both Supabase frontend variables before building if cloud sync is desired.

## Data and limits

With Supabase configured, sign-in and row-level security keep each user's projects separate and sync their project documents. Without it, ideas and project history are saved in the user's browser with localStorage. Use **Export** for a JSON backup and **Import** to restore it as an unapproved draft. Browser storage can be cleared by the browser. Moving between prompts only tracks which prompt is being viewed; it does not verify the builder's work.

The API endpoint limits body length, validates response shapes, and returns generic upstream errors without echoing credentials. With a shared server key, configure `APP_ACCESS_CODE` before going public. For a multi-user product, add authenticated users, server rate limiting, and a database before distributing access broadly.

## Checks

Run `npm test` for suggestion selection and approval/versioning invariants, then `npm run build` for the production build.
