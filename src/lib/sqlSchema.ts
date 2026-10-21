import initial from '../../supabase/migrations/20261011_initial_schema.sql?raw';
import repair from '../../supabase/migrations/20261012_consolidated_repair.sql?raw';
import hardening from '../../supabase/migrations/20261021_bugfix_hardening.sql?raw';
import lockdown from '../../supabase/migrations/20261022_lockdown.sql?raw';
import backups from '../../supabase/migrations/20261022b_app_backups.sql?raw';

export const CANONICAL_SUPABASE_SQL = initial + '\n\n' + repair + '\n\n' + hardening + '\n\n' + lockdown + '\n\n' + backups;
