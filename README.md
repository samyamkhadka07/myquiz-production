# MyQuiz — MEC CEE Preparation Platform

Clean Vercel-first Next.js application backed exclusively by Supabase PostgreSQL, Auth, Storage, and selectively Realtime. The academic source of truth is the Medical Education Commission's *Bachelor Level Common Entrance Examination syllabus (2020, third revision April 28, 2026)*.

This repository is new. It contains no Cloudflare runtime, Wrangler, TiDB, MySQL, Express server, or local-filesystem runtime dependency.

## Local setup

1. Copy `.env.example` to `.env.local` and supply Supabase values.
2. Install dependencies with `npm install`.
3. Apply `supabase/migrations` in filename order to a new Supabase project.
4. Run `npm run check`, then `npm run dev`.

Never place the service-role key in a `NEXT_PUBLIC_` variable.
