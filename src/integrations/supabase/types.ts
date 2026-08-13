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
          id: string
          integration_id: string
          license_id: string
          name: string | null
          permissions: string[]
          raw: Json
          synced_at: string
          tenant_id: string
          total_count: number | null
          updated_at: string
        }
        Insert: {
          assigned_count?: number
          created_at?: string
          id?: string
          integration_id: string
          license_id: string
          name?: string | null
          permissions?: string[]
          raw?: Json
          synced_at?: string
          tenant_id: string
          total_count?: number | null
          updated_at?: string
        }
        Update: {
          assigned_count?: number
          created_at?: string
          id?: string
          integration_id?: string
          license_id?: string
          name?: string | null
          permissions?: string[]
          raw?: Json
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
          id: string
          integration_id: string
          media_settings: Json
          member_count: number | null
          name: string | null
          queue_id: string
          raw: Json
          synced_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_created?: string | null
          description?: string | null
          division_name?: string | null
          id?: string
          integration_id: string
          media_settings?: Json
          member_count?: number | null
          name?: string | null
          queue_id: string
          raw?: Json
          synced_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_created?: string | null
          description?: string | null
          division_name?: string | null
          id?: string
          integration_id?: string
          media_settings?: Json
          member_count?: number | null
          name?: string | null
          queue_id?: string
          raw?: Json
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
      genesys_users: {
        Row: {
          created_at: string
          date_created: string | null
          department: string | null
          division_name: string | null
          email: string | null
          genesys_user_id: string
          id: string
          integration_id: string
          last_login_at: string | null
          license_name: string | null
          name: string | null
          presence: string | null
          raw: Json
          state: string | null
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
          genesys_user_id: string
          id?: string
          integration_id: string
          last_login_at?: string | null
          license_name?: string | null
          name?: string | null
          presence?: string | null
          raw?: Json
          state?: string | null
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
          genesys_user_id?: string
          id?: string
          integration_id?: string
          last_login_at?: string | null
          license_name?: string | null
          name?: string | null
          presence?: string | null
          raw?: Json
          state?: string | null
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
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          integration_id: string
          started_at: string
          stats: Json
          status: string
          tenant_id: string
          trigger: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id: string
          started_at?: string
          stats?: Json
          status?: string
          tenant_id: string
          trigger?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string
          started_at?: string
          stats?: Json
          status?: string
          tenant_id?: string
          trigger?: string
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
          connected_at: string | null
          connected_by: string | null
          created_at: string
          external_org_id: string | null
          external_org_name: string | null
          health_detail: string | null
          health_status: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          metadata: Json
          provider: string
          region: string | null
          scopes: string[]
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          external_org_id?: string | null
          external_org_name?: string | null
          health_detail?: string | null
          health_status?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          provider: string
          region?: string | null
          scopes?: string[]
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          external_org_id?: string | null
          external_org_name?: string | null
          health_detail?: string | null
          health_status?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          provider?: string
          region?: string | null
          scopes?: string[]
          status?: string
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
          created_at: string
          id: string
          name: string
          report_retention_days: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          report_retention_days?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          report_retention_days?: number
          slug?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "manager" | "analyst" | "viewer"
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
    },
  },
} as const
