-- Explicitly preserve the safety invariant for all current tenants.
UPDATE public.tenants
SET environment_mode = 'live'
WHERE environment_mode IS DISTINCT FROM 'demo';
