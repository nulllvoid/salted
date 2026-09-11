import { useRouter } from 'expo-router';
import { FeatureSlides } from '@/components/feature-slides';

export default function AboutScreen() {
  const router = useRouter();
  return (
    <FeatureSlides
      reviewing
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
