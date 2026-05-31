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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      banned: {
        Row: {
          banned_at: string
          reason: string | null
          telegram_id: number
        }
        Insert: {
          banned_at?: string
          reason?: string | null
          telegram_id: number
        }
        Update: {
          banned_at?: string
          reason?: string | null
          telegram_id?: number
        }
        Relationships: []
      }
      chat_logs: {
        Row: {
          created_at: string
          id: number
          role: string
          text: string | null
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          role: string
          text?: string | null
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          role?: string
          text?: string | null
          user_id?: number
        }
        Relationships: []
      }
      convos: {
        Row: {
          admin_id: number
          started_at: string
          target_user_id: number
        }
        Insert: {
          admin_id: number
          started_at?: string
          target_user_id: number
        }
        Update: {
          admin_id?: number
          started_at?: string
          target_user_id?: number
        }
        Relationships: []
      }
      movies: {
        Row: {
          added_by: number | null
          created_at: string
          file_id: string
          file_kind: string
          file_size: number | null
          id: number
          language: string | null
          quality: string | null
          title: string
          type: string | null
          year: number | null
        }
        Insert: {
          added_by?: number | null
          created_at?: string
          file_id: string
          file_kind?: string
          file_size?: number | null
          id?: number
          language?: string | null
          quality?: string | null
          title: string
          type?: string | null
          year?: number | null
        }
        Update: {
          added_by?: number | null
          created_at?: string
          file_id?: string
          file_kind?: string
          file_size?: number | null
          id?: number
          language?: string | null
          quality?: string | null
          title?: string
          type?: string | null
          year?: number | null
        }
        Relationships: []
      }
      payload_store: {
        Row: {
          data: Json
          expires_at: string
          key: string
        }
        Insert: {
          data: Json
          expires_at?: string
          key: string
        }
        Update: {
          data?: Json
          expires_at?: string
          key?: string
        }
        Relationships: []
      }
      pending_uploads: {
        Row: {
          admin_id: number
          payload: Json
          updated_at: string
        }
        Insert: {
          admin_id: number
          payload: Json
          updated_at?: string
        }
        Update: {
          admin_id?: number
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      requests: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          id: number
          status: string
          title: string
          user_id: number
          username: string | null
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          id?: number
          status?: string
          title: string
          user_id: number
          username?: string | null
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          id?: number
          status?: string
          title?: string
          user_id?: number
          username?: string | null
        }
        Relationships: []
      }
      tg_users: {
        Row: {
          first_name: string | null
          joined_at: string
          last_seen: string
          message_count: number
          telegram_id: number
          username: string | null
        }
        Insert: {
          first_name?: string | null
          joined_at?: string
          last_seen?: string
          message_count?: number
          telegram_id: number
          username?: string | null
        }
        Update: {
          first_name?: string | null
          joined_at?: string
          last_seen?: string
          message_count?: number
          telegram_id?: number
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
