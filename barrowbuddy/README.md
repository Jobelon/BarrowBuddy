# BorrowBuddy

BorrowBuddy is a campus lending app for CIT students. The Vite app includes responsive login and sign-up screens with looping 3D scenes, plus email confirmation, password recovery, and student profile setup.

## Run locally

Copy `.env.example` to `.env.local` and enter your Supabase project URL and **publishable** key.

```sh
npm install
npm run dev
```

Keep **Confirm Email** enabled in Supabase. Add the app's exact origin with both `/login` and `/reset-password` to the Auth redirect allowlist. For example, if Vite shows `http://localhost:5173`, allow `http://localhost:5173/login` and `http://localhost:5173/reset-password`. Configure email delivery for CIT inboxes before onboarding students.

When hosting the build, serve `index.html` for the app's routes so links to `/signup`, `/forgot-password`, and `/reset-password` load correctly.

Sign-up details are held in the student's own Auth metadata until their CIT email is confirmed and the details are saved to `profiles`. The app then clears the temporary Auth metadata.

```sh
npm run lint
npm run build
```
