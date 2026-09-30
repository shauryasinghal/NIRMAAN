-- Schedules the SQL notification generators every 30 minutes when pg_cron exists
-- (it does on Supabase; on a plain local Postgres this is a no-op).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'nirmaan-sql-jobs') then
      perform cron.schedule('nirmaan-sql-jobs', '*/30 * * * *', 'select private.run_scheduled_sql_jobs()');
    end if;
  else
    raise notice 'pg_cron not available; run private.run_scheduled_sql_jobs() from the backend scheduler instead';
  end if;
end $$;
