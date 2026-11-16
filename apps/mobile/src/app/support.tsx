import type { Metadata } from 'expo-router/server';
import { LegalPage } from '@/components/LegalPage';

export function generateMetadata(): Metadata {
  return { title: 'الدعم | لَبّيك', description: 'تواصل مع دعم لَبّيك بشأن الطلبات والحساب والخصوصية.' };
}

export default function SupportScreen() {
  return <LegalPage page="support" />;
}
