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

// Display Syrian phone numbers in local form and isolate them from Arabic (RTL) text.
export const prettyPhone = (number: string) => {
  const asciiDigits = number.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10));
  const digits = asciiDigits.replace(/\D/g, '');
  const national = digits.startsWith('00963') ? digits.slice(5) : digits.startsWith('963') ? digits.slice(3) : digits;
  const local = national.startsWith('09') ? national.slice(0, 10) : national.startsWith('9') ? `0${national.slice(0, 9)}` : national;
  return /^09\d{8}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : number;
};
export const ltrPhone = (number: string) => `\u2066${prettyPhone(number)}\u2069`;
