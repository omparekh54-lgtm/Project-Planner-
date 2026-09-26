# Forma — idea to build

Forma helps someone turn a rough product idea into an approved project brief, then guides them through builder-specific prompts, reviewing results before moving to the next step.

## Run locally

Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`.

Set `GEMINI_API_KEY` on the server to enable the shared AI connection. **Also set `APP_ACCESS_CODE`** to protect the public deployment from arbitrary consumption of your API quota. Alternatively, leave the server key unset and let each user enter their own Gemini key in the Settings dialog; browser-provided keys remain in tab memory and are sent only to the app's server endpoint, which relays requests to Google. Neither kind of secret belongs in git.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`; change it to a model available to your key if needed.

## Deployment

Connect this GitHub repository to Vercel as a Next.js project. Set `GEMINI_API_KEY` and `APP_ACCESS_CODE` as server environment variables in the Vercel project settings, then redeploy. Do not prefix either with `NEXT_PUBLIC_`.

## Data and limits

Ideas and project history are saved in the user's browser with localStorage. Use **Export** for a JSON backup and **Import** to restore it as an unapproved draft. Browser storage does not sync between devices and can be cleared by the browser. There is no account system or cloud database in this release. Feedback review evaluates only the evidence the user pasted; it cannot inspect the actual builder or repository. The app cannot certify deployment without verifiable supplied evidence.

The API endpoint limits body length, validates response shapes, and returns generic upstream errors without echoing credentials. With a shared server key, configure `APP_ACCESS_CODE` before going public. For a multi-user product, add authenticated users, server rate limiting, and a database before distributing access broadly.

## Checks

Run `npm test` for approval/versioning and review progression invariants, then `npm run build` for the production build.
