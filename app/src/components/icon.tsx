import { Platform, type ColorValue } from 'react-native';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  House,
  Minus,
  Plus,
  RotateCw,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

const icons = {
  back: ArrowLeft,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  eye: Eye,
  eyeOff: EyeOff,
  home: House,
  minus: Minus,
  plus: Plus,
  refresh: RotateCw,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;
export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color?: ColorValue;
  size?: number;
}) {
  const theme = useTheme();
  const Component = icons[name];
  return (
    <Component
      size={size}
      color={color ?? theme.text}
      strokeWidth={2.75}
      accessible={Platform.OS === 'web' ? undefined : false}
      aria-hidden
    />
  );
}
