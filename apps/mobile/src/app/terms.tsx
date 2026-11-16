import type { Metadata } from 'expo-router/server';
import { LegalPage } from '@/components/LegalPage';

export function generateMetadata(): Metadata {
  return { title: 'شروط الاستخدام | لَبّيك', description: 'شروط استخدام تطبيق وخدمة لَبّيك.' };
}

export default function TermsScreen() {
  return <LegalPage page="terms" />;
}
