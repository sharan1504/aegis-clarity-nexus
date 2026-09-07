insert into public.capabilities (key, display_name, description, category, read_only, write_capable)
values
  ('repo_inventory', 'Repository Inventory', 'Read synchronized GitHub repositories for governed agents.', 'Security', true, false)
on conflict (key) do nothing;

insert into public.provider_capabilities (provider, capability_key)
values ('github', 'repo_inventory'), ('github', 'security_findings')
on conflict do nothing;
