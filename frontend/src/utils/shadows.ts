import { Platform, type ViewStyle } from 'react-native';

interface ShadowOptions {
  color: string;
  offsetY: number;
  blur: number;
  opacity: number;
  elevation: number;
}

export const createElevation = ({
  color,
  offsetY,
  blur,
  opacity,
  elevation,
}: ShadowOptions): ViewStyle =>
  Platform.select({
    web: {
      boxShadow: `0px ${offsetY}px ${blur}px ${color}`,
    } as ViewStyle,
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blur,
      elevation,
    },
  }) ?? {};
