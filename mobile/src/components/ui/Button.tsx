import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export function Button({ title, variant = 'primary', loading, style, ...rest }: Props) {
  const theme = useTheme();

  const bgColor =
    variant === 'primary'   ? theme.colors.brandPrimary :
    variant === 'secondary' ? theme.colors.surface :
                              theme.colors.error;

  const textColor =
    variant === 'primary'   ? theme.colors.brandOnPrimary :
    variant === 'secondary' ? theme.colors.textPrimary :
                              '#FFFFFF';

  const borderColor = variant === 'secondary' ? theme.colors.border : 'transparent';

  return (
    <TouchableOpacity
      style={[
        styles.base,
        { backgroundColor: bgColor, borderColor, borderWidth: variant === 'secondary' ? 1 : 0 },
        rest.disabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: { opacity: 0.5 },
  text: { fontSize: 15, fontWeight: '600' },
});
