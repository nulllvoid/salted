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
      activity_log: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          flat_id: string
          id: string
          poll_id: string | null
          recipe_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          flat_id: string
          id?: string
          poll_id?: string | null
          recipe_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          flat_id?: string
          id?: string
          poll_id?: string | null
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_by: string | null
          poll_id: string
          quantity: number
          recipe_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          added_by?: string | null
          poll_id: string
          quantity: number
          recipe_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          added_by?: string | null
          poll_id?: string
          quantity?: number
          recipe_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cooks: {
        Row: {
          audit_note: string | null
          created_at: string
          flat_id: string
          id: string
          is_active: boolean
          language: string
          name: string
          phone: string
        }
        Insert: {
          audit_note?: string | null
          created_at?: string
          flat_id: string
          id?: string
          is_active?: boolean
          language?: string
          name: string
          phone: string
        }
        Update: {
          audit_note?: string | null
          created_at?: string
          flat_id?: string
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooks_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_polls: {
        Row: {
          created_at: string
          flat_id: string
          flat_meal_id: string
          flat_note: string | null
          id: string
          poll_date: string
          status: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          flat_meal_id: string
          flat_note?: string | null
          id?: string
          poll_date: string
          status?: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          flat_meal_id?: string
          flat_note?: string | null
          id?: string
          poll_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_polls_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_polls_flat_meal_id_fkey"
            columns: ["flat_meal_id"]
            isOneToOne: false
            referencedRelation: "flat_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      day_attendance: {
        Row: {
          flat_id: string
          flat_meal_id: string
          is_out: boolean
          poll_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          flat_id: string
          flat_meal_id: string
          is_out?: boolean
          poll_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          flat_id?: string
          flat_meal_id?: string
          is_out?: boolean
          poll_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_attendance_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_attendance_flat_meal_id_fkey"
            columns: ["flat_meal_id"]
            isOneToOne: false
            referencedRelation: "flat_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_log: {
        Row: {
          bsp_message_id: string | null
          created_at: string
          error: string | null
          headcount: number
          id: string
          language: string
          mode: string
          payload_en: string
          payload_translated: string
          poll_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bsp_message_id?: string | null
          created_at?: string
          error?: string | null
          headcount: number
          id?: string
          language: string
          mode: string
          payload_en: string
          payload_translated: string
          poll_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bsp_message_id?: string | null
          created_at?: string
          error?: string | null
          headcount?: number
          id?: string
          language?: string
          mode?: string
          payload_en?: string
          payload_translated?: string
          poll_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_log_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          body: string
          created_at: string
          flat_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          flat_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          flat_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_meals: {
        Row: {
          basis: string
          close_time: string
          created_at: string
          dispatch_offset_min: number
          flat_id: string
          id: string
          is_active: boolean
          name: string
          open_offset_min: number
          position: number
          serve_time: string
        }
        Insert: {
          basis?: string
          close_time: string
          created_at?: string
          dispatch_offset_min: number
          flat_id: string
          id?: string
          is_active?: boolean
          name: string
          open_offset_min: number
          position?: number
          serve_time: string
        }
        Update: {
          basis?: string
          close_time?: string
          created_at?: string
          dispatch_offset_min?: number
          flat_id?: string
          id?: string
          is_active?: boolean
          name?: string
          open_offset_min?: number
          position?: number
          serve_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "flat_meals_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_members: {
        Row: {
          flat_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          flat_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          flat_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flat_members_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flats: {
        Row: {
          created_at: string
          created_by: string | null
          dispatch_time: string
          id: string
          invite_code: string
          max_accompaniments: number | null
          max_mains: number | null
          name: string
          poll_close_time: string
          poll_open_time: string
          tz: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatch_time?: string
          id?: string
          invite_code?: string
          max_accompaniments?: number | null
          max_mains?: number | null
          name: string
          poll_close_time?: string
          poll_open_time?: string
          tz?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatch_time?: string
          id?: string
          invite_code?: string
          max_accompaniments?: number | null
          max_mains?: number | null
          name?: string
          poll_close_time?: string
          poll_open_time?: string
          tz?: string
        }
        Relationships: [
          {
            foreignKeyName: "flats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_checks: {
        Row: {
          checked_at: string
          checked_by: string | null
          ingredient_id: string
          poll_id: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          ingredient_id: string
          poll_id: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          ingredient_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_checks_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_checks_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_feedback: {
        Row: {
          created_at: string
          poll_id: string
          thumbs_up: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          poll_id: string
          thumbs_up: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          poll_id?: string
          thumbs_up?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_feedback_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_errors: {
        Row: {
          created_at: string
          detail: Json
          flat_id: string | null
          id: string
          stage: string
        }
        Insert: {
          created_at?: string
          detail: Json
          flat_id?: string | null
          id?: string
          stage: string
        }
        Update: {
          created_at?: string
          detail?: Json
          flat_id?: string | null
          id?: string
          stage?: string
        }
        Relationships: []
      }
      poll_accompaniment_options: {
        Row: {
          poll_id: string
          position: number
          recipe_id: string
        }
        Insert: {
          poll_id: string
          position: number
          recipe_id: string
        }
        Update: {
          poll_id?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_accompaniment_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_accompaniment_options_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          poll_id: string
          position: number
          recipe_id: string
        }
        Insert: {
          poll_id: string
          position: number
          recipe_id: string
        }
        Update: {
          poll_id?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "daily_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergies: string[]
          created_at: string
          diet_type: string
          display_name: string
          id: string
          is_jain: boolean
          notifications_muted: boolean
          phone: string | null
          push_token: string | null
        }
        Insert: {
          allergies?: string[]
          created_at?: string
          diet_type?: string
          display_name: string
          id: string
          is_jain?: boolean
          notifications_muted?: boolean
          phone?: string | null
          push_token?: string | null
        }
        Update: {
          allergies?: string[]
          created_at?: string
          diet_type?: string
          display_name?: string
          id?: string
          is_jain?: boolean
          notifications_muted?: boolean
          phone?: string | null
          push_token?: string | null
        }
        Relationships: []
      }
      recipe_accompaniments: {
        Row: {
          accompaniment_recipe_id: string
          main_recipe_id: string
          sort_order: number
        }
        Insert: {
          accompaniment_recipe_id: string
          main_recipe_id: string
          sort_order?: number
        }
        Update: {
          accompaniment_recipe_id?: string
          main_recipe_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_accompaniments_accompaniment_recipe_id_fkey"
            columns: ["accompaniment_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_accompaniments_main_recipe_id_fkey"
            columns: ["main_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          category: string
          id: string
          is_staple: boolean
          name_en: string
          name_hi: string | null
          name_kn: string | null
          qty_per_person: number
          recipe_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          category: string
          id?: string
          is_staple?: boolean
          name_en: string
          name_hi?: string | null
          name_kn?: string | null
          qty_per_person: number
          recipe_id: string
          sort_order?: number
          unit: string
        }
        Update: {
          category?: string
          id?: string
          is_staple?: boolean
          name_en?: string
          name_hi?: string | null
          name_kn?: string | null
          qty_per_person?: number
          recipe_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_translations: {
        Row: {
          instructions: string
          language: string
          recipe_id: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          instructions: string
          language: string
          recipe_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          instructions?: string
          language?: string
          recipe_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_translations_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          allergens: string[]
          base: string
          created_at: string
          cuisine: string
          diet_class: string
          id: string
          image_path: string | null
          instructions_en: string
          is_active: boolean
          jain_ok: boolean
          kind: string
          name: string
          seasons: string[]
          slug: string
          suitable_bases: string[]
        }
        Insert: {
          allergens?: string[]
          base: string
          created_at?: string
          cuisine: string
          diet_class: string
          id?: string
          image_path?: string | null
          instructions_en: string
          is_active?: boolean
          jain_ok?: boolean
          kind?: string
          name: string
          seasons?: string[]
          slug: string
          suitable_bases?: string[]
        }
        Update: {
          allergens?: string[]
          base?: string
          created_at?: string
          cuisine?: string
          diet_class?: string
          id?: string
          image_path?: string | null
          instructions_en?: string
          is_active?: boolean
          jain_ok?: boolean
          kind?: string
          name?: string
          seasons?: string[]
          slug?: string
          suitable_bases?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_flat_member: { Args: { target_flat_id: string }; Returns: boolean }
      take_fallback_cart_item: {
        Args: { p_poll_id: string; p_quantity: number; p_recipe_id: string }
        Returns: undefined
      }
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
