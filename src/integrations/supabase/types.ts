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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      chunks: {
        Row: {
          chunk_index: number
          cluster_id: number | null
          cluster_label: string | null
          content_hash: string
          created_at: string
          cti: number | null
          document_id: string
          embedding: string | null
          embedding_dim: number
          fy: number | null
          fz: number | null
          id: string
          intention: Json | null
          source_path: string | null
          text: string
          triangulation: Json | null
        }
        Insert: {
          chunk_index: number
          cluster_id?: number | null
          cluster_label?: string | null
          content_hash: string
          created_at?: string
          cti?: number | null
          document_id: string
          embedding?: string | null
          embedding_dim?: number
          fy?: number | null
          fz?: number | null
          id?: string
          intention?: Json | null
          source_path?: string | null
          text: string
          triangulation?: Json | null
        }
        Update: {
          chunk_index?: number
          cluster_id?: number | null
          cluster_label?: string | null
          content_hash?: string
          created_at?: string
          cti?: number | null
          document_id?: string
          embedding?: string | null
          embedding_dim?: number
          fy?: number | null
          fz?: number | null
          id?: string
          intention?: Json | null
          source_path?: string | null
          text?: string
          triangulation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters_summary: {
        Row: {
          avg_cti: number | null
          avg_fy: number | null
          avg_fz: number | null
          centroid_embedding: string | null
          cluster_id: number
          created_at: string
          description: string | null
          document_id: string
          embedding_dim: number
          id: string
          label: string
          unit_count: number
        }
        Insert: {
          avg_cti?: number | null
          avg_fy?: number | null
          avg_fz?: number | null
          centroid_embedding?: string | null
          cluster_id: number
          created_at?: string
          description?: string | null
          document_id: string
          embedding_dim?: number
          id?: string
          label: string
          unit_count?: number
        }
        Update: {
          avg_cti?: number | null
          avg_fy?: number | null
          avg_fz?: number | null
          centroid_embedding?: string | null
          cluster_id?: number
          created_at?: string
          description?: string | null
          document_id?: string
          embedding_dim?: number
          id?: string
          label?: string
          unit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "clusters_summary_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          embedding_dim: number
          embedding_model: string
          filename: string
          id: string
          source_type: string
          stats: Json
          uploaded_at: string
        }
        Insert: {
          embedding_dim?: number
          embedding_model?: string
          filename: string
          id?: string
          source_type: string
          stats?: Json
          uploaded_at?: string
        }
        Update: {
          embedding_dim?: number
          embedding_model?: string
          filename?: string
          id?: string
          source_type?: string
          stats?: Json
          uploaded_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks: {
        Args: {
          match_count?: number
          min_cti?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          cluster_label: string
          cti: number
          document_id: string
          fz: number
          id: string
          similarity: number
          source_path: string
          text: string
        }[]
      }
      match_clusters: {
        Args: {
          exclude_document_id?: string
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          avg_cti: number
          avg_fz: number
          cluster_id: number
          description: string
          document_id: string
          id: string
          label: string
          similarity: number
          unit_count: number
        }[]
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
