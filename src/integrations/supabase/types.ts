export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agent_capabilities: {
        Row: {
          agent_key: string
          capability_id: string
          created_at: string
          id: string
          required: boolean
        }
        Insert: {
          agent_key: string
          capability_id: string
          created_at?: string
          id?: string
          required?: boolean
        }
        Update: {
          agent_key?: string
          capability_id?: string
          created_at?: string
          id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_capabilities_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_definitions: {
        Row: {
          agent_key: string
          category: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
        }
        Insert: {
          agent_key: string
          category?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
        }
        Update: {
          agent_key?: string
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      agent_integration_bindings: {
        Row: {
          agent_key: string
          capability_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          integration_id: string
          is_mock: boolean
          policy: Json
          policy_updated_at: string
          policy_updated_by: string | null
          policy_version: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_key: string
          capability_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          integration_id: string
          is_mock?: boolean
          policy?: Json
          policy_updated_at?: string
          policy_updated_by?: string | null
          policy_version?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_key?: string
          capability_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          integration_id?: string
          is_mock?: boolean
          policy?: Json
          policy_updated_at?: string
          policy_updated_by?: string | null
          policy_version?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_integration_bindings_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_integration_bindings_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_integration_bindings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_integration_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_policy_revisions: {
        Row: {
          agent_key: string
          binding_id: string
          capability_id: string
          changed_by: string | null
          created_at: string
          id: string
          integration_id: string
          policy: Json
          policy_version: number
          tenant_id: string
        }
        Insert: {
          agent_key: string
          binding_id: string
          capability_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          integration_id: string
          policy?: Json
          policy_version: number
          tenant_id: string
        }
        Update: {
          agent_key?: string
          binding_id?: string
          capability_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          integration_id?: string
          policy?: Json
          policy_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_policy_revisions_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_policy_revisions_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "agent_integration_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_policy_revisions_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_policy_revisions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_policy_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          agent_key: string
          created_at: string
          guardrails: Json
          id: string
          post_instructions: string | null
          pre_instructions: string | null
          system_instructions: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_key: string
          created_at?: string
          guardrails?: Json
          id?: string
          post_instructions?: string | null
          pre_instructions?: string | null
          system_instructions?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_key?: string
          created_at?: string
          guardrails?: Json
          id?: string
          post_instructions?: string | null
          pre_instructions?: string | null
          system_instructions?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          actor_name: string
          actor_role: string
          actor_type: string
          agent: string | null
          approval_id: string | null
          approval_status: string | null
          changes: Json
          correlation_id: string
          id: string
          integration: string | null
          metadata: Json
          reason: string | null
          resource_name: string
          resource_type: string
          result: string
          risk: string
          seeded: boolean
          source: Json
          target_id: string | null
          tenant_id: string
          timestamp: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          actor_name: string
          actor_role?: string
          actor_type?: string
          agent?: string | null
          approval_id?: string | null
          approval_status?: string | null
          changes?: Json
          correlation_id: string
          id?: string
          integration?: string | null
          metadata?: Json
          reason?: string | null
          resource_name: string
          resource_type: string
          result: string
          risk: string
          seeded?: boolean
          source?: Json
          target_id?: string | null
          tenant_id: string
          timestamp?: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          actor_type?: string
          agent?: string | null
          approval_id?: string | null
          approval_status?: string | null
          changes?: Json
          correlation_id?: string
          id?: string
          integration?: string | null
          metadata?: Json
          reason?: string | null
          resource_name?: string
          resource_type?: string
          result?: string
          risk?: string
          seeded?: boolean
          source?: Json
          target_id?: string | null
          tenant_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string
          hash: string
          id: string
          payload: Json
          prev_hash: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type: string
          hash?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string
          hash?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          capability_key: string
          category: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          read_only: boolean
          write_capable: boolean
        }
        Insert: {
          capability_key: string
          category?: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          read_only?: boolean
          write_capable?: boolean
        }
        Update: {
          capability_key?: string
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          read_only?: boolean
          write_capable?: boolean
        }
        Relationships: []
      }
      change_approvals: {
        Row: {
          approver: string
          approver_role: string | null
          change_record_id: string
          comment: string | null
          created_at: string
          decided_at: string | null
          id: string
          position: number
          status: string
          team: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approver: string
          approver_role?: string | null
          change_record_id: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          position?: number
          status?: string
          team: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approver?: string
          approver_role?: string | null
          change_record_id?: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          position?: number
          status?: string
          team?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_approvals_change_record_id_fkey"
            columns: ["change_record_id"]
            isOneToOne: false
            referencedRelation: "change_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      change_records: {
        Row: {
          agent: string | null
          ai_reasoning: string | null
          business_impact: string | null
          category: string | null
          change_id: string
          change_window: Json
          created_at: string
          execution_mode: string
          external_tickets: Json
          id: string
          owner_team: string
          requester: string | null
          risk: Json
          rollback_steps: Json
          severity: string
          stage: string
          tenant_id: string
          timeline: Json
          title: string
          updated_at: string
          validations: Json
        }
        Insert: {
          agent?: string | null
          ai_reasoning?: string | null
          business_impact?: string | null
          category?: string | null
          change_id: string
          change_window?: Json
          created_at?: string
          execution_mode?: string
          external_tickets?: Json
          id?: string
          owner_team: string
          requester?: string | null
          risk?: Json
          rollback_steps?: Json
          severity?: string
          stage?: string
          tenant_id: string
          timeline?: Json
          title: string
          updated_at?: string
          validations?: Json
        }
        Update: {
          agent?: string | null
          ai_reasoning?: string | null
          business_impact?: string | null
          category?: string | null
          change_id?: string
          change_window?: Json
          created_at?: string
          execution_mode?: string
          external_tickets?: Json
          id?: string
          owner_team?: string
          requester?: string | null
          risk?: Json
          rollback_steps?: Json
          severity?: string
          stage?: string
          tenant_id?: string
          timeline?: Json
          title?: string
          updated_at?: string
          validations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "change_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      genesys_licenses: {
        Row: {
          assigned_count: number
          created_at: string
          first_seen_at: string
          id: string
          integration_id: string
          is_current: boolean
          last_seen_at: string
          last_seen_sync_id: string | null
          license_id: string
          name: string | null
          permissions: string[]
          raw: Json
          retired_at: string | null
          snapshot_id: string | null
          sync_id: string | null
          synced_at: string
          tenant_id: string
          total_count: number | null
          updated_at: string
        }
        Insert: {
          assigned_count?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          integration_id: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_id: string
          name?: string | null
          permissions?: string[]
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id: string
          total_count?: number | null
          updated_at?: string
        }
        Update: {
          assigned_count?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          integration_id?: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_id?: string
          name?: string | null
          permissions?: string[]
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id?: string
          total_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genesys_licenses_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genesys_licenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      genesys_queues: {
        Row: {
          created_at: string
          date_created: string | null
          description: string | null
          division_name: string | null
          first_seen_at: string
          id: string
          integration_id: string
          is_current: boolean
          last_seen_at: string
          last_seen_sync_id: string | null
          media_settings: Json
          member_count: number | null
          name: string | null
          queue_id: string
          raw: Json
          retired_at: string | null
          snapshot_id: string | null
          sync_id: string | null
          synced_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_created?: string | null
          description?: string | null
          division_name?: string | null
          first_seen_at?: string
          id?: string
          integration_id: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          media_settings?: Json
          member_count?: number | null
          name?: string | null
          queue_id: string
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_created?: string | null
          description?: string | null
          division_name?: string | null
          first_seen_at?: string
          id?: string
          integration_id?: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          media_settings?: Json
          member_count?: number | null
          name?: string | null
          queue_id?: string
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genesys_queues_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genesys_queues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      genesys_user_licenses: {
        Row: {
          created_at: string
          first_seen_at: string
          genesys_user_id: string
          id: string
          integration_id: string
          is_current: boolean
          last_seen_at: string
          last_seen_sync_id: string | null
          license_id: string
          retired_at: string | null
          snapshot_id: string | null
          sync_id: string | null
          synced_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          genesys_user_id: string
          id?: string
          integration_id: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_id: string
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          genesys_user_id?: string
          id?: string
          integration_id?: string
          is_current?: boolean
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_id?: string
          retired_at?: string | null
          snapshot_id?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genesys_user_licenses_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genesys_user_licenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      genesys_users: {
        Row: {
          created_at: string
          date_created: string | null
          department: string | null
          division_name: string | null
          email: string | null
          first_seen_at: string
          genesys_user_id: string
          id: string
          integration_id: string
          is_current: boolean
          last_login_at: string | null
          last_seen_at: string
          last_seen_sync_id: string | null
          license_name: string | null
          name: string | null
          presence: string | null
          raw: Json
          retired_at: string | null
          snapshot_id: string | null
          state: string | null
          sync_id: string | null
          synced_at: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_created?: string | null
          department?: string | null
          division_name?: string | null
          email?: string | null
          first_seen_at?: string
          genesys_user_id: string
          id?: string
          integration_id: string
          is_current?: boolean
          last_login_at?: string | null
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_name?: string | null
          name?: string | null
          presence?: string | null
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          state?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_created?: string | null
          department?: string | null
          division_name?: string | null
          email?: string | null
          first_seen_at?: string
          genesys_user_id?: string
          id?: string
          integration_id?: string
          is_current?: boolean
          last_login_at?: string | null
          last_seen_at?: string
          last_seen_sync_id?: string | null
          license_name?: string | null
          name?: string | null
          presence?: string | null
          raw?: Json
          retired_at?: string | null
          snapshot_id?: string | null
          state?: string | null
          sync_id?: string | null
          synced_at?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genesys_users_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genesys_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrail_evaluations: {
        Row: {
          action_key: string | null
          agent_key: string | null
          capability: string | null
          change_record_id: string | null
          context: Json
          created_at: string
          decision: string
          environment: string
          execution_class: string | null
          id: string
          integration_id: string | null
          matched: Json
          provider: string | null
          reasons: Json
          required_actions: Json
          simulated: boolean
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action_key?: string | null
          agent_key?: string | null
          capability?: string | null
          change_record_id?: string | null
          context?: Json
          created_at?: string
          decision: string
          environment?: string
          execution_class?: string | null
          id?: string
          integration_id?: string | null
          matched?: Json
          provider?: string | null
          reasons?: Json
          required_actions?: Json
          simulated?: boolean
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action_key?: string | null
          agent_key?: string | null
          capability?: string | null
          change_record_id?: string | null
          context?: Json
          created_at?: string
          decision?: string
          environment?: string
          execution_class?: string | null
          id?: string
          integration_id?: string | null
          matched?: Json
          provider?: string | null
          reasons?: Json
          required_actions?: Json
          simulated?: boolean
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_evaluations_change_record_id_fkey"
            columns: ["change_record_id"]
            isOneToOne: false
            referencedRelation: "change_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardrail_evaluations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardrail_evaluations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrail_revisions: {
        Row: {
          action: Json
          changed_by: string | null
          conditions: Json
          created_at: string
          enabled: boolean
          enforcement_mode: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_id: string
          guardrail_type: string
          id: string
          message: string | null
          name: string
          priority: number
          reason: string | null
          scope: Database["public"]["Enums"]["guardrail_scope"]
          scope_id: string | null
          severity: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id: string | null
          version: number
        }
        Insert: {
          action: Json
          changed_by?: string | null
          conditions: Json
          created_at?: string
          enabled: boolean
          enforcement_mode: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_id: string
          guardrail_type: string
          id?: string
          message?: string | null
          name: string
          priority: number
          reason?: string | null
          scope: Database["public"]["Enums"]["guardrail_scope"]
          scope_id?: string | null
          severity: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id?: string | null
          version: number
        }
        Update: {
          action?: Json
          changed_by?: string | null
          conditions?: Json
          created_at?: string
          enabled?: boolean
          enforcement_mode?: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_id?: string
          guardrail_type?: string
          id?: string
          message?: string | null
          name?: string
          priority?: number
          reason?: string | null
          scope?: Database["public"]["Enums"]["guardrail_scope"]
          scope_id?: string | null
          severity?: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrails: {
        Row: {
          action: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          enforcement_mode: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_type: string
          id: string
          is_system: boolean
          message: string | null
          name: string
          priority: number
          scope: Database["public"]["Enums"]["guardrail_scope"]
          scope_id: string | null
          severity: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          action?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          enforcement_mode?: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_type: string
          id?: string
          is_system?: boolean
          message?: string | null
          name: string
          priority?: number
          scope: Database["public"]["Enums"]["guardrail_scope"]
          scope_id?: string | null
          severity?: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          action?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          enforcement_mode?: Database["public"]["Enums"]["guardrail_enforcement"]
          guardrail_type?: string
          id?: string
          is_system?: boolean
          message?: string | null
          name?: string
          priority?: number
          scope?: Database["public"]["Enums"]["guardrail_scope"]
          scope_id?: string | null
          severity?: Database["public"]["Enums"]["guardrail_severity"]
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "guardrails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          access_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          expires_at: string | null
          id: string
          integration_id: string
          refresh_token: string | null
          scopes: string[]
          tenant_id: string
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_id: string
          refresh_token?: string | null
          scopes?: string[]
          tenant_id: string
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_id?: string
          refresh_token?: string | null
          scopes?: string[]
          tenant_id?: string
          token_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          provider: string
          redirect_uri: string
          region: string | null
          state: string
          tenant_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          provider: string
          redirect_uri: string
          region?: string | null
          state: string
          tenant_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          provider?: string
          redirect_uri?: string
          region?: string | null
          state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_oauth_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_runs: {
        Row: {
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          integration_id: string
          lock_expires_at: string | null
          promoted_at: string | null
          retry_count: number
          snapshot_id: string
          started_at: string
          stats: Json
          status: string
          tenant_id: string
          trigger: string
          validation_detail: string | null
          validation_status: string | null
          warnings: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id: string
          lock_expires_at?: string | null
          promoted_at?: string | null
          retry_count?: number
          snapshot_id?: string
          started_at?: string
          stats?: Json
          status?: string
          tenant_id: string
          trigger?: string
          validation_detail?: string | null
          validation_status?: string | null
          warnings?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string
          lock_expires_at?: string | null
          promoted_at?: string | null
          retry_count?: number
          snapshot_id?: string
          started_at?: string
          stats?: Json
          status?: string
          tenant_id?: string
          trigger?: string
          validation_detail?: string | null
          validation_status?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          active_snapshot_id: string | null
          active_sync_run_id: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          display_name: string | null
          external_org_id: string | null
          external_org_name: string | null
          health_detail: string | null
          health_status: string
          id: string
          is_mock: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          metadata: Json
          provider: string
          region: string | null
          scopes: string[]
          status: string
          sync_lock_expires_at: string | null
          sync_lock_run_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active_snapshot_id?: string | null
          active_sync_run_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_org_id?: string | null
          external_org_name?: string | null
          health_detail?: string | null
          health_status?: string
          id?: string
          is_mock?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          provider: string
          region?: string | null
          scopes?: string[]
          status?: string
          sync_lock_expires_at?: string | null
          sync_lock_run_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active_snapshot_id?: string | null
          active_sync_run_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_org_id?: string | null
          external_org_name?: string | null
          health_detail?: string | null
          health_status?: string
          id?: string
          is_mock?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          provider?: string
          region?: string | null
          scopes?: string[]
          status?: string
          sync_lock_expires_at?: string | null
          sync_lock_run_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          kind: string
          tenant_id: string
          title: string
          unread: boolean
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          tenant_id: string
          title: string
          unread?: boolean
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          tenant_id?: string
          title?: string
          unread?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_instruction_revisions: {
        Row: {
          category: string
          changed_by: string | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          instruction_id: string
          instruction_text: string
          name: string
          priority: number
          scope: string
          scope_id: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          category: string
          changed_by?: string | null
          created_at?: string
          description?: string | null
          enabled: boolean
          id?: string
          instruction_id: string
          instruction_text: string
          name: string
          priority: number
          scope: string
          scope_id?: string | null
          tenant_id: string
          version: number
        }
        Update: {
          category?: string
          changed_by?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          instruction_id?: string
          instruction_text?: string
          name?: string
          priority?: number
          scope?: string
          scope_id?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_instruction_revisions_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "organization_instructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_instruction_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_instructions: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          instruction_text: string
          name: string
          priority: number
          scope: string
          scope_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instruction_text: string
          name: string
          priority?: number
          scope?: string
          scope_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instruction_text?: string
          name?: string
          priority?: number
          scope?: string
          scope_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_capabilities: {
        Row: {
          capability_id: string
          created_at: string
          id: string
          implemented: boolean
          notes: string | null
          provider: string
        }
        Insert: {
          capability_id: string
          created_at?: string
          id?: string
          implemented?: boolean
          notes?: string | null
          provider: string
        }
        Update: {
          capability_id?: string
          created_at?: string
          id?: string
          implemented?: boolean
          notes?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_connections: {
        Row: {
          connected_at: string | null
          created_by: string | null
          credential_expires_at: string | null
          display_name: string | null
          encrypted_credentials: string | null
          external_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_by?: string | null
          credential_expires_at?: string | null
          display_name?: string | null
          encrypted_credentials?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_by?: string | null
          credential_expires_at?: string | null
          display_name?: string | null
          encrypted_credentials?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_sync_entities: {
        Row: {
          created_at: string
          entity_key: string
          entity_type: string
          id: string
          observed_at: string
          payload: Json
          provider: string
          stale: boolean
          sync_run_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_key: string
          entity_type: string
          id?: string
          observed_at?: string
          payload: Json
          provider: string
          stale?: boolean
          sync_run_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_key?: string
          entity_type?: string
          id?: string
          observed_at?: string
          payload?: Json
          provider?: string
          stale?: boolean
          sync_run_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_sync_entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_sync_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          provider: string
          records_seen: number
          records_staled: number
          records_upserted: number
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          provider: string
          records_seen?: number
          records_staled?: number
          records_upserted?: number
          started_at?: string
          status: string
          tenant_id: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          provider?: string
          records_seen?: number
          records_staled?: number
          records_upserted?: number
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_sync_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string | null
          dataset: string
          expires_at: string | null
          format: string
          id: string
          name: string
          params: Json
          purged_at: string | null
          size_bytes: number
          storage_path: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataset: string
          expires_at?: string | null
          format: string
          id?: string
          name: string
          params?: Json
          purged_at?: string | null
          size_bytes?: number
          storage_path: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataset?: string
          expires_at?: string | null
          format?: string
          id?: string
          name?: string
          params?: Json
          purged_at?: string | null
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          analytics_settings: Json
          created_at: string
          id: string
          name: string
          primary_domain: string | null
          report_retention_days: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          analytics_settings?: Json
          created_at?: string
          id?: string
          name: string
          primary_domain?: string | null
          report_retention_days?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          analytics_settings?: Json
          created_at?: string
          id?: string
          name?: string
          primary_domain?: string | null
          report_retention_days?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_attempts: {
        Row: {
          attempt: number
          attempted_at: string
          audit_log_id: string | null
          error_message: string | null
          event_type: string
          id: string
          next_retry_at: string | null
          status_code: number | null
          success: boolean
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          attempt?: number
          attempted_at?: string
          audit_log_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          next_retry_at?: string | null
          status_code?: number | null
          success?: boolean
          tenant_id: string
          webhook_id: string
        }
        Update: {
          attempt?: number
          attempted_at?: string
          audit_log_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          next_retry_at?: string | null
          status_code?: number | null
          success?: boolean
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_attempts_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_attempts_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_outbox: {
        Row: {
          attempts: number
          audit_log_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          status: string
          tenant_id: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          audit_log_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          audit_log_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_outbox_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_outbox_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          enabled: boolean
          event_types: string[]
          id: string
          secret: string
          target_url: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_types: string[]
          id?: string
          secret: string
          target_url: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_types?: string[]
          id?: string
          secret?: string
          target_url?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "manager" | "analyst" | "viewer"
      guardrail_effect:
        | "block"
        | "require_approval"
        | "require_confirmation"
        | "escalate"
        | "limit"
        | "require_change_ticket"
        | "allow"
      guardrail_enforcement: "enforce" | "monitor"
      guardrail_scope:
        | "platform"
        | "organization"
        | "environment"
        | "agent"
        | "integration"
        | "capability"
        | "tool"
      guardrail_severity: "low" | "medium" | "high" | "critical"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "analyst", "viewer"],
      guardrail_effect: [
        "block",
        "require_approval",
        "require_confirmation",
        "escalate",
        "limit",
        "require_change_ticket",
        "allow",
      ],
      guardrail_enforcement: ["enforce", "monitor"],
      guardrail_scope: [
        "platform",
        "organization",
        "environment",
        "agent",
        "integration",
        "capability",
        "tool",
      ],
      guardrail_severity: ["low", "medium", "high", "critical"],
    },
  },
} as const
