import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SupportContact = { phone: string | null; whatsapp: string | null };
let cached: SupportContact | null = null;

// Support numbers live in the database (public.app_settings) so they can change without an app update.
export function useSupportContact(): SupportContact | null {
  const [contact, setContact] = useState<SupportContact | null>(cached);
  useEffect(() => {
    if (cached || !supabase) return;
    let active = true;
    void supabase.from('app_settings').select('key,value').in('key', ['support_phone', 'support_whatsapp']).then(({ data, error }) => {
      if (!active || error) return;
      const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
      cached = { phone: map.support_phone ?? null, whatsapp: map.support_whatsapp ?? map.support_phone ?? null };
      setContact(cached);
    });
    return () => { active = false; };
  }, []);
  return contact;
}

export const whatsappUrl = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`;
