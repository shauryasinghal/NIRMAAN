-- NEW. "Unknown = NULL": difficulty and format were NOT NULL with fabricated defaults
-- ('intermediate' / 'online'), which made an unstated value look like a stated one.
alter table public.opportunities alter column difficulty drop not null, alter column difficulty drop default;
alter table public.opportunities alter column format     drop not null, alter column format     drop default;
