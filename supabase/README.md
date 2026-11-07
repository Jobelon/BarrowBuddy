# BorrowBuddy backend

The migration creates the Supabase tables, policies, and borrowing functions. The database rejects new accounts and email changes outside the exact `cit.edu` domain. Access to application data requires a confirmed CIT email. The MVP uses mailbox access as its eligibility check.

## Hosted Auth settings

In Supabase Authentication settings, enable the Email provider and **Confirm Email**. Keep **Secure Email Change** enabled. Configure the app's Site URL and allowed redirect URLs when the frontend is ready. Configure an SMTP sender that can deliver confirmation emails to CIT inboxes before onboarding students.

## API flow

1. After email confirmation, insert a row into `profiles` with `full_name`, `student_id_number`, and `program`. Supabase assigns the user's UUID, `student` role, and timestamps. Existing profiles can supply their missing student ID and program together on their next edit.
2. To list an item, insert into `items` with `name` and optionally `description`. To browse, select items with `is_available = true`.
3. Call `request_item` with `p_item_id`. A repeated request while it is pending returns the existing request.
4. The owner calls `update_borrow_request` with `p_request_id` and `p_action` set to `accept`, `decline`, or `return`. The borrower can use `cancel` while their request is pending.

Acceptance makes the item unavailable and declines its other pending requests in the same transaction. Recording the return makes the item available again. Only the borrower and item owner can read the request.

Students can read only their own profile. To show the owner's name on a listing, call `get_profile_name` with `p_profile_id` set to the item's `owner_id`. Use Supabase Auth to read the signed-in user's institutional email and to set or change their password. Auth stores the password hash separately.

For an optional profile picture, upload a JPEG, PNG, or WebP (up to 5 MiB) to the private `profile-pictures` bucket at `<user-id>/avatar`. Set the file's content type explicitly and use upsert to replace it. After upload, set `profiles.avatar_path` to that same path. To remove it, delete the Storage object and clear `avatar_path`. Verified CIT users can download pictures with an authenticated Storage request. Only the account owner can upload, replace, or remove their picture.
