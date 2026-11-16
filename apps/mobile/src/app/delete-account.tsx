import type { Metadata } from 'expo-router/server';
import { LegalPage } from '@/components/LegalPage';

export function generateMetadata(): Metadata {
  return { title: 'حذف الحساب | لَبّيك', description: 'اطلب حذف حسابك وبياناتك في لَبّيك دون الحاجة إلى تسجيل الدخول.' };
}

export default function DeleteAccountScreen() {
  return <LegalPage page="delete-account" />;
}
