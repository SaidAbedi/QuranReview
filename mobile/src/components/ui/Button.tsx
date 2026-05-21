import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

interface Props extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export function Button({ title, variant = 'primary', loading, style, ...rest }: Props) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], rest.disabled && styles.disabled, style]}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primary: { backgroundColor: '#1B4F72' },
  secondary: { backgroundColor: '#E5E7EB' },
  danger: { backgroundColor: '#DC2626' },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: '#1B4F72' },
});
