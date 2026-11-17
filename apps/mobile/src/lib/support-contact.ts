import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SupportContact = { phone: string | null; whatsapp: string | null };
// Used until (or unless) public.app_settings provides numbers, so the buttons always work.
const DEFAULT_SUPPORT_NUMBER = '+963938797237';
const defaultContact: SupportContact = { phone: DEFAULT_SUPPORT_NUMBER, whatsapp: DEFAULT_SUPPORT_NUMBER };
let cached: SupportContact | null = null;

// Support numbers live in the database (public.app_settings) so they can change without an app update.
export function useSupportContact(): SupportContact {
  const [contact, setContact] = useState<SupportContact>(cached ?? defaultContact);
  useEffect(() => {
    if (cached || !supabase) return;
    let active = true;
    void supabase.from('app_settings').select('key,value').in('key', ['support_phone', 'support_whatsapp']).then(({ data, error }) => {
      if (!active || error) return;
      const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
      cached = { phone: map.support_phone ?? defaultContact.phone, whatsapp: map.support_whatsapp ?? map.support_phone ?? defaultContact.whatsapp };
      setContact(cached);
    });
    return () => { active = false; };
  }, []);
  return contact;
}

export const whatsappUrl = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`;

// Phone numbers are left-to-right text: isolate them so the "+" and digit groups never flip inside Arabic (RTL) lines.
export const ltrPhone = (number: string) => `\u2066${number}\u2069`;
export const prettyPhone = (number: string) => {
  const digits = number.replace(/[^\d+]/g, '');
  return /^\+963\d{9}$/.test(digits) ? `+963 ${digits.slice(4, 7)} ${digits.slice(7, 10)} ${digits.slice(10)}` : number;
};
