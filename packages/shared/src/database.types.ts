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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; value: string; updated_at: string }
        Insert: { key: string; value: string; updated_at?: string }
        Update: { key?: string; value?: string; updated_at?: string }
        Relationships: []
      }
      addresses: {
        Row: {
          building: string | null
          city: string
          contact_phone: string
          created_at: string
          floor: string | null
          governorate: string
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          neighborhood: string
          notes: string | null
          street: string | null
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          building?: string | null
          city: string
          contact_phone: string
          created_at?: string
          floor?: string | null
          governorate: string
          id?: string
          is_default?: boolean
          label: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          notes?: string | null
          street?: string | null
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          building?: string | null
          city?: string
          contact_phone?: string
          created_at?: string
          floor?: string | null
          governorate?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string
          notes?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json
          before_data: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json
          before_data?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json
          before_data?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          reason?: string
        }
        Relationships: []
      }
      cash_settlements: {
        Row: {
          cash_collected_minor: number
          commission_amount_minor: number
          commission_rate_basis_points: number
          created_at: string
          delivery_fee_minor: number
          driver_earning_minor: number
          driver_id: string
          id: number
          idempotency_key: string
          order_id: string
          purchase_amount_minor: number
          settled_by: string
        }
        Insert: {
          cash_collected_minor: number
          commission_amount_minor: number
          commission_rate_basis_points: number
          created_at?: string
          delivery_fee_minor: number
          driver_earning_minor: number
          driver_id: string
          id?: never
          idempotency_key: string
          order_id: string
          purchase_amount_minor: number
          settled_by: string
        }
        Update: {
          cash_collected_minor?: number
          commission_amount_minor?: number
          commission_rate_basis_points?: number
          created_at?: string
          delivery_fee_minor?: number
          driver_earning_minor?: number
          driver_id?: string
          id?: never
          idempotency_key?: string
          order_id?: string
          purchase_amount_minor?: number
          settled_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_settlements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cash_settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_settlement_reversals: {
        Row: {
          created_at: string
          id: number
          idempotency_key: string
          reason: string
          reversed_by: string
          settlement_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          idempotency_key: string
          reason: string
          reversed_by: string
          settlement_id: number
        }
        Update: {
          created_at?: string
          id?: never
          idempotency_key?: string
          reason?: string
          reversed_by?: string
          settlement_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_settlement_reversals_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: true
            referencedRelation: "cash_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_policies: {
        Row: {
          id: number
          rate_basis_points: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          id?: number
          rate_basis_points: number
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          id?: number
          rate_basis_points?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      driver_invites: {
        Row: {
          auto_approve: boolean
          created_at: string
          created_by: string
          expires_at: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          auto_approve?: boolean
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          auto_approve?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          age: number | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          is_online: boolean
          phone_e164: string | null
          review_status: Database["public"]["Enums"]["driver_review_status"]
          service_zone_id: string | null
          updated_at: string
          user_id: string
          vehicle_description: string | null
        }
        Insert: {
          age?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          is_online?: boolean
          phone_e164?: string | null
          review_status?: Database["public"]["Enums"]["driver_review_status"]
          service_zone_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_description?: string | null
        }
        Update: {
          age?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          is_online?: boolean
          phone_e164?: string | null
          review_status?: Database["public"]["Enums"]["driver_review_status"]
          service_zone_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_service_zone_id_fkey"
            columns: ["service_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_wallet_ledger: {
        Row: {
          actor_id: string | null
          amount_minor: number
          created_at: string
          driver_id: string
          entry_type: string
          id: number
          idempotency_key: string
          order_id: string | null
          reason: string
          reversal_of_entry_id: number | null
          settlement_id: number | null
        }
        Insert: {
          actor_id?: string | null
          amount_minor: number
          created_at?: string
          driver_id: string
          entry_type: string
          id?: never
          idempotency_key: string
          order_id?: string | null
          reason: string
          reversal_of_entry_id?: number | null
          settlement_id?: number | null
        }
        Update: {
          actor_id?: string | null
          amount_minor?: number
          created_at?: string
          driver_id?: string
          entry_type?: string
          id?: never
          idempotency_key?: string
          order_id?: string | null
          reason?: string
          reversal_of_entry_id?: number | null
          settlement_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallet_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "driver_wallet_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_ledger_reversal_of_entry_id_fkey"
            columns: ["reversal_of_entry_id"]
            isOneToOne: false
            referencedRelation: "driver_wallet_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_ledger_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "cash_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      global_delivery_pricing: {
        Row: {
          base_fee_minor: number
          id: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          base_fee_minor?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          base_fee_minor?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          event_type: string
          id: number
          order_id: string | null
          read_at: string | null
          recipient_id: string
          source_event_id: number | null
          source_offer_id: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          event_type: string
          id?: never
          order_id?: string | null
          read_at?: string | null
          recipient_id: string
          source_event_id?: number | null
          source_offer_id?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          event_type?: string
          id?: never
          order_id?: string | null
          read_at?: string | null
          recipient_id?: string
          source_event_id?: number | null
          source_offer_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "order_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_source_offer_id_fkey"
            columns: ["source_offer_id"]
            isOneToOne: false
            referencedRelation: "order_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_disputes: {
        Row: {
          created_at: string
          details: string
          id: string
          idempotency_key: string
          opened_by: string
          order_id: string
          previous_order_status: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          details: string
          id?: string
          idempotency_key: string
          opened_by: string
          order_id: string
          previous_order_status: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          idempotency_key?: string
          opened_by?: string
          order_id?: string
          previous_order_status?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: number
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: never
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: never
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_offers: {
        Row: {
          created_at: string
          driver_id: string
          expires_at: string
          id: string
          order_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          expires_at: string
          id?: string
          order_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          expires_at?: string
          id?: string
          order_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          no_response_alerted_at: string | null
          customer_wait_alerted_at: string | null
          address_id: string | null
          base_fee_minor: number
          budget_ceiling_minor: number
          is_urgent: boolean
          category: string | null
          commission_policy_version: number | null
          commission_rate_basis_points: number | null
          created_at: string
          currency: string
          customer_id: string | null
          delivered_at: string | null
          delivery_code_attempts: number
          delivery_code_expires_at: string | null
          delivery_code_hash: string | null
          cash_collected_minor: number | null
          delivery_note: string | null
          delivery_fee_minor: number
            delivery_quote_approved_at: string | null
            delivery_quote_set_at: string | null
            delivery_quote_set_by: string | null
          driver_id: string | null
          id: string
          idempotency_key: string
          pricing_rule_version: number
          purchase_amount_minor: number | null
          purchase_approved_at: string | null
          purchased_at: string | null
          request_text: string
          status: string
          updated_at: string
          zone_id: string | null
          zone_surcharge_minor: number
        }
        Insert: {
          no_response_alerted_at?: string | null
          customer_wait_alerted_at?: string | null
          address_id: string | null
          base_fee_minor?: number
          budget_ceiling_minor?: number
          is_urgent?: boolean
          category?: string | null
          commission_policy_version?: number | null
          commission_rate_basis_points?: number | null
          created_at?: string
          currency?: string
          customer_id: string | null
          delivered_at?: string | null
          delivery_code_attempts?: number
          delivery_code_expires_at?: string | null
          delivery_code_hash?: string | null
          cash_collected_minor?: number | null
          delivery_note?: string | null
          delivery_fee_minor: number
            delivery_quote_approved_at?: string | null
            delivery_quote_set_at?: string | null
            delivery_quote_set_by?: string | null
          driver_id?: string | null
          id?: string
          idempotency_key: string
          pricing_rule_version?: number
          purchase_amount_minor?: number | null
          purchase_approved_at?: string | null
          purchased_at?: string | null
          request_text: string
          status?: string
          updated_at?: string
          zone_id: string | null
          zone_surcharge_minor?: number
        }
        Update: {
          no_response_alerted_at?: string | null
          customer_wait_alerted_at?: string | null
          address_id?: string
          base_fee_minor?: number
          budget_ceiling_minor?: number
          is_urgent?: boolean
          category?: string | null
          commission_policy_version?: number | null
          commission_rate_basis_points?: number | null
          created_at?: string
          currency?: string
          customer_id?: string
          delivered_at?: string | null
          delivery_code_attempts?: number
          delivery_code_expires_at?: string | null
          delivery_code_hash?: string | null
          cash_collected_minor?: number | null
          delivery_note?: string | null
          delivery_fee_minor?: number
            delivery_quote_approved_at?: string | null
            delivery_quote_set_at?: string | null
            delivery_quote_set_by?: string | null
          driver_id?: string | null
          id?: string
          idempotency_key?: string
          pricing_rule_version?: number
          purchase_amount_minor?: number | null
          purchase_approved_at?: string | null
          purchased_at?: string | null
          request_text?: string
          status?: string
          updated_at?: string
          zone_id?: string | null
          zone_surcharge_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_zones: {
        Row: {
          active: boolean
          city: string
          created_at: string
          currency: string
          delivery_surcharge_minor: number
          governorate: string
          id: string
          name: string
          neighborhood: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city: string
          created_at?: string
          currency?: string
          delivery_surcharge_minor?: number
          governorate: string
          id?: string
          name: string
          neighborhood?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string
          created_at?: string
          currency?: string
          delivery_surcharge_minor?: number
          governorate?: string
          id?: string
          name?: string
          neighborhood?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_order_offer: { Args: { p_offer_id: string }; Returns: string }
      adjust_driver_wallet: {
        Args: {
          p_amount_minor: number
          p_driver_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: number
      }
      admin_list_users: {
        Args: never
        Returns: {
          account_suspended: boolean
          created_at: string
          display_name: string
          driver_status: Database["public"]["Enums"]["driver_review_status"] | null
          email: string
          email_confirmed: boolean
          last_sign_in_at: string | null
          roles: string[]
          user_id: string
        }[]
      }
      admin_update_user_profile: {
        Args: {
          p_display_name: string
          p_reason: string
          p_user_id: string
          p_vehicle_description: string
        }
        Returns: undefined
      }
      get_cash_reconciliation: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cash_collected_total_minor: number
          commission_total_minor: number
          delivery_fee_total_minor: number
          driver_earning_total_minor: number
          purchase_total_minor: number
          settlement_count: number
        }[]
      }
      reverse_cash_settlement: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_settlement_id: number
        }
        Returns: number
      }
      cancel_admin_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_customer_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      confirm_order_delivery: {
        Args: { p_code: string; p_order_id: string }
        Returns: boolean
      }
      admin_pause_order: { Args: { p_dispute_id: string }; Returns: undefined }
      admin_create_driver_invite: { Args: never; Returns: string }
      flag_unanswered_orders: { Args: never; Returns: number }
      get_order_driver_contact: {
        Args: { p_order_id: string }
        Returns: { display_name: string; phone: string | null }[]
      }
      confirm_order_delivery_with_photo: {
        Args: { p_order_id: string; p_proof_path: string; p_cash_collected_minor?: number | null; p_note?: string | null }
        Returns: undefined
      }
      confirm_order_purchase: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      create_customer_order: {
        Args: {
          p_address_id: string
          p_budget_ceiling_minor: number
          p_idempotency_key: string
          p_is_urgent?: boolean
          p_request_text: string
        }
        Returns: string
      }
      admin_price_and_dispatch_order: {
        Args: { p_order_id: string; p_fee_minor: number; p_driver_id: string | null; p_reason: string }
        Returns: number
      }
      decline_order_offer: { Args: { p_offer_id: string }; Returns: undefined }
      dispatch_order: { Args: { p_order_id: string }; Returns: number }
      get_driver_wallet_balances: {
        Args: never
        Returns: {
          balance_minor: number
          driver_id: string
        }[]
      }
      issue_delivery_code: {
        Args: { p_order_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      mark_notification_read: {
        Args: { p_notification_id: number }
        Returns: undefined
      }
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      open_order_dispute: {
        Args: {
          p_details: string
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
        }
        Returns: string
      }
      record_order_purchase: {
        Args: { p_order_id: string; p_purchase_amount_minor: number }
        Returns: string
      }
      register_push_token: {
        Args: { p_expo_push_token: string; p_platform: string }
        Returns: undefined
      }
      redeem_driver_invite: {
        Args: { p_token: string; p_vehicle_description?: string }
        Returns: Database["public"]["Enums"]["driver_review_status"]
      }
      resolve_order_dispute: {
        Args: { p_dispute_id: string; p_resolution: string }
        Returns: string
      }
      respond_purchase_approval: {
        Args: { p_approved: boolean; p_order_id: string }
        Returns: string
      }
      reverse_driver_wallet_entry: {
        Args: {
          p_entry_id: number
          p_idempotency_key: string
          p_reason: string
        }
        Returns: number
      }
      review_driver_application: {
        Args: { p_approved: boolean; p_user_id: string }
        Returns: Database["public"]["Enums"]["driver_review_status"]
      }
      set_commission_rate: {
        Args: { p_rate_basis_points: number; p_reason: string }
        Returns: number
      }
      set_global_delivery_fee: {
        Args: { p_fee_minor: number; p_reason: string }
        Returns: number
      }
      set_zone_delivery_surcharge: {
        Args: { p_fee_minor: number; p_reason: string; p_zone_id: string }
        Returns: undefined
      }
      settle_cash_order: {
        Args: { p_idempotency_key: string; p_order_id: string }
        Returns: number
      }
      set_order_delivery_quote: {
        Args: { p_fee_minor: number; p_order_id: string; p_reason: string }
        Returns: undefined
      }
      respond_delivery_quote: {
        Args: { p_approved: boolean; p_order_id: string }
        Returns: string
      }
      start_order_delivery: { Args: { p_order_id: string }; Returns: undefined }
      start_order_shopping: { Args: { p_order_id: string }; Returns: undefined }
      top_up_driver_wallet: {
        Args: {
          p_amount_minor: number
          p_driver_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "customer" | "driver_pending" | "driver" | "super_admin"
      driver_review_status: "pending" | "approved" | "suspended" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "driver_pending", "driver", "super_admin"],
      driver_review_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
