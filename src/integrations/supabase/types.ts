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
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
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
            referencedRelation: "document_cti_ranking"
            referencedColumns: ["id"]
          },
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
          custom_label: string | null
          custom_label_updated_at: string | null
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
          custom_label?: string | null
          custom_label_updated_at?: string | null
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
          custom_label?: string | null
          custom_label_updated_at?: string | null
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
            referencedRelation: "document_cti_ranking"
            referencedColumns: ["id"]
          },
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
          content_hash: string | null
          embedding_dim: number
          embedding_model: string
          filename: string
          id: string
          share_to_global: boolean
          source_type: string
          stats: Json
          uploaded_at: string
          user_id: string | null
        }
        Insert: {
          content_hash?: string | null
          embedding_dim?: number
          embedding_model?: string
          filename: string
          id?: string
          share_to_global?: boolean
          source_type: string
          stats?: Json
          uploaded_at?: string
          user_id?: string | null
        }
        Update: {
          content_hash?: string | null
          embedding_dim?: number
          embedding_model?: string
          filename?: string
          id?: string
          share_to_global?: boolean
          source_type?: string
          stats?: Json
          uploaded_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      document_cti_ranking: {
        Row: {
          avg_cti: number | null
          avg_fy: number | null
          avg_fz: number | null
          chunk_count: number | null
          cluster_count: number | null
          filename: string | null
          id: string | null
          max_cti: number | null
          source_type: string | null
          uploaded_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_orphan_documents: { Args: never; Returns: number }
      corpus_cluster_edges: {
        Args: { max_edges?: number; min_similarity?: number }
        Returns: {
          dst_cluster: number
          dst_doc: string
          dst_id: string
          dst_label: string
          fy_delta: number
          fz_delta: number
          hybrid: number
          similarity: number
          src_cluster: number
          src_doc: string
          src_id: string
          src_label: string
        }[]
      }
      corpus_cluster_quality: {
        Args: { noise_threshold?: number }
        Returns: {
          cluster_id: number
          cluster_summary_id: string
          cohesion: number
          document_id: string
          member_count: number
          noise_ratio: number
          separation: number
        }[]
      }
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
      match_clusters_hybrid: {
        Args: {
          exclude_doc_id?: string
          fz_fy_weight?: number
          match_count?: number
          min_similarity?: number
          query_embedding: string
          query_fy: number
          query_fz: number
        }
        Returns: {
          avg_cti: number
          avg_fy: number
          avg_fz: number
          cluster_id: number
          custom_label: string
          description: string
          document_id: string
          filename: string
          fy_delta: number
          fz_delta: number
          hybrid_score: number
          id: string
          label: string
          similarity: number
          unit_count: number
        }[]
      }
      refresh_document_cti_ranking: { Args: never; Returns: undefined }
      user_owns_document: { Args: { _doc_id: string }; Returns: boolean }
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
