create or replace function public.audit_guardrail_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision <> 'allow' then
    insert into public.audit_log (tenant_id, action, entity_type, entity_id, detail, payload)
    values (
      new.tenant_id,
      'guardrail.triggered',
      'integration',
      new.change_record_id,
      'Guardrail decision: ' || new.decision,
      jsonb_build_object(
        'decision', new.decision,
        'actionKey', new.action_key,
        'provider', new.provider,
        'capability', new.capability,
        'executionClass', new.execution_class,
        'reasons', new.reasons,
        'requiredActions', new.required_actions
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists guardrail_evaluation_audit_trigger on public.guardrail_evaluations;
create trigger guardrail_evaluation_audit_trigger
after insert on public.guardrail_evaluations
for each row execute function public.audit_guardrail_trigger();
