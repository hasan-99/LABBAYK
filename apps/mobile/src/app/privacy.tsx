import type { Metadata } from 'expo-router/server';
import { LegalPage } from '@/components/LegalPage';

export function generateMetadata(): Metadata {
  return { title: 'سياسة الخصوصية | لَبّيك', description: 'سياسة الخصوصية لتطبيق وخدمة لَبّيك.' };
}

export default function PrivacyPolicyScreen() {
  return <LegalPage page="privacy" />;
}
